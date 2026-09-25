import unittest

import chromadb

from app.services.chroma_store import ChromaStore
from app.services.pdf_processor import PdfChunk


class ChromaModelFilterTests(unittest.TestCase):
    def test_legacy_f3000_chunk_is_repaired_without_reindexing(self):
        client = chromadb.EphemeralClient()
        collection = client.create_collection("legacy_f3000_scope_test")
        content = "Cycle Life maintains over 80% capacity after 3500 cycles."
        collection.add(
            ids=["legacy-cycle-life"],
            embeddings=[[1.0, 0.0]],
            documents=[content],
            metadatas=[{
                "document_id": "f3000-manual",
                "document_name": (
                    "PECRON_F3000_LFP_user_manual_100V_120V_V2-20260310.pdf"
                ),
                "page_number": 3,
                "model_ids": "XT60,XT120",
                "document_model_ids": "F3000LFP,XT60,XT120",
                "model_scope": "explicit",
                "is_active": True,
            }],
        )
        store = ChromaStore.__new__(ChromaStore)
        store._get_collection = lambda _company_id: collection
        store._embed = lambda _texts: [[1.0, 0.0]]

        results = store.hybrid_query(
            "company",
            "What's the expected cycle life of this PEC-F3000LFP unit?",
            5,
            required_model_ids={"F3000LFP"},
        )

        self.assertEqual([result["content"] for result in results], [content])
        self.assertEqual(results[0]["model_ids"], ["F3000LFP"])

    def test_f3000_filename_owns_cycle_life_chunk(self):
        client = chromadb.EphemeralClient()
        collection = client.create_collection("f3000_cycle_life_scope_test")
        store = ChromaStore.__new__(ChromaStore)
        store._get_collection = lambda _company_id: collection
        store._embed = lambda texts: [[1.0, 0.0] for _text in texts]

        content = (
            "Battery specifications: Cycle Life maintains over 80% capacity "
            "after 3500 cycles. XT60 input and XT120 battery expansion port."
        )
        store.add_document_chunks(
            "company",
            "f3000-manual",
            "PECRON_F3000_LFP_user_manual_100V_120V_V2-20260310.pdf",
            [PdfChunk(content=content, page_number=3)],
        )

        stored = collection.get(include=["documents", "metadatas"])
        metadata = stored["metadatas"][0]
        self.assertEqual(metadata["model_ids"], "F3000LFP")
        self.assertEqual(metadata["document_model_ids"], "F3000LFP")
        self.assertEqual(metadata["model_scope"], "document")

        results = store.hybrid_query(
            "company",
            "What's the expected cycle life of this PEC-F3000LFP unit?",
            5,
            required_model_ids={"F3000LFP"},
        )
        self.assertEqual([result["content"] for result in results], [content])

    def test_add_document_chunks_returns_count_and_stores_raw_text(self):
        client = chromadb.EphemeralClient()
        collection = client.create_collection("ingest_return_test")
        store = ChromaStore.__new__(ChromaStore)
        store._get_collection = lambda _company_id: collection
        store._embed = lambda texts: [[1.0, 0.0] for _text in texts]

        count = store.add_document_chunks(
            "company",
            "document",
            "SunSaver manual.pdf",
            [PdfChunk(content="Model SS-6-12V", page_number=1)],
        )

        stored = collection.get(include=["documents"])
        self.assertEqual(count, 1)
        self.assertEqual(stored["documents"], ["Model SS-6-12V"])

    def test_legacy_embedding_labels_are_hidden_from_answer_context(self):
        stored = (
            "Document: operation-manual-.pdf\n"
            "Product model: SS1012V, NFPA70\n\n"
            "Available model: SS-10-12V"
        )

        self.assertEqual(
            ChromaStore._display_content(stored),
            "Available model: SS-10-12V",
        )

    def test_ingestion_marks_model_free_manual_instructions_as_shared(self):
        client = chromadb.EphemeralClient()
        collection = client.create_collection("shared_ingestion_test")
        store = ChromaStore.__new__(ChromaStore)
        store._get_collection = lambda _company_id: collection
        store._embed = lambda texts: [[1.0, 0.0] for _text in texts]

        store.add_document_chunks(
            "company",
            "abso-manual",
            "Abso-AC-Charger-REV-C.pdf",
            [
                PdfChunk(
                    content="Models AC1220, AC1240, and AC1260",
                    page_number=1,
                ),
                PdfChunk(
                    content="Silent Mode disables the cooling fan for 12 hours.",
                    page_number=6,
                ),
            ],
        )

        stored = collection.get(include=["documents", "metadatas"])
        by_content = dict(zip(stored["documents"], stored["metadatas"]))
        shared = by_content["Silent Mode disables the cooling fan for 12 hours."]

        self.assertEqual(shared["model_scope"], "shared")
        self.assertEqual(shared["model_ids"], "")
        self.assertEqual(
            set(shared["document_model_ids"].split(",")),
            {"AC1220", "AC1240", "AC1260"},
        )

    def test_model_specific_page_continuation_does_not_become_shared(self):
        client = chromadb.EphemeralClient()
        collection = client.create_collection("model_page_scope_test")
        store = ChromaStore.__new__(ChromaStore)
        store._get_collection = lambda _company_id: collection
        store._embed = lambda texts: [[1.0, 0.0] for _text in texts]

        store.add_document_chunks(
            "company",
            "abso-manual",
            "Abso-AC-Charger-REV-C.pdf",
            [
                PdfChunk(
                    content="Models AC1240 and AC1260",
                    page_number=1,
                ),
                PdfChunk(
                    content="AC1260 maximum charging current specifications.",
                    page_number=9,
                ),
                PdfChunk(
                    content="The maximum charging current is 60 A.",
                    page_number=9,
                ),
            ],
        )

        stored = collection.get(include=["documents", "metadatas"])
        by_content = dict(zip(stored["documents"], stored["metadatas"]))
        continuation = by_content["The maximum charging current is 60 A."]

        self.assertEqual(continuation["model_scope"], "explicit")
        self.assertEqual(continuation["model_ids"], "AC1260")

    def test_inactive_and_other_model_chunks_are_excluded_before_ranking(self):
        client = chromadb.EphemeralClient()
        collection = client.create_collection("model_filter_test")
        collection.add(
            ids=["correct", "wrong-model", "inactive"],
            embeddings=[[1.0, 0.0], [1.0, 0.0], [1.0, 0.0]],
            documents=[
                "IC1230150 fuse rating is 450 A",
                "IC121040 fuse rating is 300 A",
                "IC1230150 old fuse rating is 400 A",
            ],
            metadatas=[
                {
                    "document_id": "doc-correct",
                    "document_name": "IC1230150.pdf",
                    "model_ids": "IC1230150",
                    "is_active": True,
                },
                {
                    "document_id": "doc-wrong",
                    "document_name": "IC121040.pdf",
                    "model_ids": "IC121040",
                    "is_active": True,
                },
                {
                    "document_id": "doc-inactive",
                    "document_name": "IC1230150_old.pdf",
                    "model_ids": "IC1230150",
                    "is_active": False,
                },
            ],
        )

        store = ChromaStore.__new__(ChromaStore)
        store._get_collection = lambda _company_id: collection
        store._embed = lambda _texts: [[1.0, 0.0]]

        results = store.hybrid_query(
            "company",
            "What fuse does IC1230150 use?",
            5,
            required_model_ids={"IC1230150"},
        )

        self.assertEqual(
            {result["document_id"] for result in results},
            {"doc-correct"},
        )

    def test_product_family_and_document_scope_exclude_other_manuals(self):
        client = chromadb.EphemeralClient()
        collection = client.create_collection("product_document_filter_test")
        collection.add(
            ids=["sun", "sine", "other-sun"],
            embeddings=[[1.0, 0.0], [1.0, 0.0], [1.0, 0.0]],
            documents=[
                "Controller self-consumption is less than 8 mA.",
                "Inverter self-consumption is 25 mA off and 450 mA on.",
                "SunSaver marketing overview.",
            ],
            metadatas=[
                {
                    "document_id": "sunsaver-manual",
                    "document_name": "operation-manual-.pdf",
                    "product_names": "sunsaver",
                    "is_active": True,
                },
                {
                    "document_id": "suresine-manual",
                    "document_name": "manual (1).pdf",
                    "product_names": "suresine",
                    "is_active": True,
                },
                {
                    "document_id": "sunsaver-brochure",
                    "document_name": "brochure.pdf",
                    "product_names": "sunsaver",
                    "is_active": True,
                },
            ],
        )

        store = ChromaStore.__new__(ChromaStore)
        store._get_collection = lambda _company_id: collection
        store._embed = lambda _texts: [[1.0, 0.0]]

        results = store.hybrid_query(
            "company",
            "What is the controller self-consumption?",
            5,
            required_product_names={"sunsaver"},
            allowed_document_ids={"sunsaver-manual"},
        )

        self.assertEqual(
            {result["document_id"] for result in results},
            {"sunsaver-manual"},
        )

    def test_shared_instructions_are_allowed_but_other_model_specs_are_rejected(self):
        client = chromadb.EphemeralClient()
        collection = client.create_collection("shared_model_filter_test")
        collection.add(
            ids=["catalog", "shared", "other-model", "other-catalog", "other-shared"],
            embeddings=[[1.0, 0.0] for _index in range(5)],
            documents=[
                "Models AC1240 and AC1260",
                "Silent Mode disables the cooling fan for 12 hours.",
                "AC1260 has a maximum charging current of 60 A.",
                "Model AC2430",
                "Silent Mode instructions for the other manual.",
            ],
            metadatas=[
                {
                    "document_id": "abso-manual",
                    "document_name": "Abso manual.pdf",
                    "page_number": 1,
                    "model_ids": "AC1240,AC1260",
                    "document_model_ids": "AC1240,AC1260",
                    "model_scope": "explicit",
                    "is_active": True,
                },
                {
                    "document_id": "abso-manual",
                    "document_name": "Abso manual.pdf",
                    "page_number": 6,
                    "model_ids": "",
                    "document_model_ids": "AC1240,AC1260",
                    "model_scope": "shared",
                    "is_active": True,
                },
                {
                    "document_id": "abso-manual",
                    "document_name": "Abso manual.pdf",
                    "page_number": 9,
                    "model_ids": "AC1260",
                    "document_model_ids": "AC1240,AC1260",
                    "model_scope": "explicit",
                    "is_active": True,
                },
                {
                    "document_id": "other-manual",
                    "document_name": "Other manual.pdf",
                    "page_number": 1,
                    "model_ids": "AC2430",
                    "document_model_ids": "AC2430",
                    "model_scope": "explicit",
                    "is_active": True,
                },
                {
                    "document_id": "other-manual",
                    "document_name": "Other manual.pdf",
                    "page_number": 6,
                    "model_ids": "",
                    "document_model_ids": "AC2430",
                    "model_scope": "shared",
                    "is_active": True,
                },
            ],
        )

        store = ChromaStore.__new__(ChromaStore)
        store._get_collection = lambda _company_id: collection
        store._embed = lambda _texts: [[1.0, 0.0]]

        results = store.hybrid_query(
            "company",
            "Can I mute the fan on AC1240?",
            10,
            required_model_ids={"AC1240"},
        )
        contents = {result["content"] for result in results}

        self.assertIn("Silent Mode disables the cooling fan for 12 hours.", contents)
        self.assertNotIn("AC1260 has a maximum charging current of 60 A.", contents)
        self.assertNotIn("Silent Mode instructions for the other manual.", contents)

    def test_legacy_index_infers_shared_chunks_from_early_model_catalog(self):
        client = chromadb.EphemeralClient()
        collection = client.create_collection("legacy_shared_model_filter_test")
        collection.add(
            ids=["catalog", "shared"],
            embeddings=[[1.0, 0.0], [1.0, 0.0]],
            documents=[
                "Models AC1240 and AC1260",
                "Silent Mode disables the cooling fan.",
            ],
            metadatas=[
                {
                    "document_id": "abso-manual",
                    "document_name": "Abso manual.pdf",
                    "page_number": 1,
                    "model_ids": "AC1240,AC1260",
                    "is_active": True,
                },
                {
                    "document_id": "abso-manual",
                    "document_name": "Abso manual.pdf",
                    "page_number": 6,
                    "model_ids": "",
                    "is_active": True,
                },
            ],
        )

        store = ChromaStore.__new__(ChromaStore)
        store._get_collection = lambda _company_id: collection
        store._embed = lambda _texts: [[1.0, 0.0]]

        results = store.hybrid_query(
            "company",
            "AC1240 silent fan mode",
            10,
            required_model_ids={"AC1240"},
        )

        self.assertIn(
            "Silent Mode disables the cooling fan.",
            {result["content"] for result in results},
        )


if __name__ == "__main__":
    unittest.main()
