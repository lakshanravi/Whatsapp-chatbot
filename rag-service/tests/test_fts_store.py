import tempfile
import unittest
from pathlib import Path

from app.services.fts_store import FTSStore


class FTSStoreTests(unittest.TestCase):
    def test_builds_from_existing_chunks_and_prefers_matching_model_fact(self):
        with tempfile.TemporaryDirectory() as directory:
            store = FTSStore(str(Path(directory) / "lexical.sqlite3"))
            ids = ["f3000-cycle", "other-cycle"]
            store.rebuild(
                "company",
                ids,
                [
                    "Cycle Life: maintains over 80% capacity after 3500 cycles.",
                    "Cycle life depends on depth of discharge.",
                ],
                [
                    {
                        "document_id": "f3000",
                        "document_name": "PECRON_F3000_LFP_user_manual.pdf",
                        "model_ids": "F3000LFP",
                        "is_active": True,
                    },
                    {
                        "document_id": "other",
                        "document_name": "Other battery manual.pdf",
                        "model_ids": "OTHER100",
                        "is_active": True,
                    },
                ],
            )

            results = store.search(
                "company",
                "expected cycle life PEC-F3000LFP",
                5,
                required_model_ids={"F3000LFP"},
            )

            self.assertEqual([item["document_id"] for item in results], ["f3000"])
            self.assertTrue(store.is_current("company", ids))

    def test_excludes_inactive_chunks_and_honors_document_scope(self):
        with tempfile.TemporaryDirectory() as directory:
            store = FTSStore(str(Path(directory) / "lexical.sqlite3"))
            store.rebuild(
                "company",
                ["active", "inactive"],
                ["Fuse rating 450 A", "Fuse rating 400 A"],
                [
                    {
                        "document_id": "current",
                        "document_name": "current.pdf",
                        "is_active": True,
                    },
                    {
                        "document_id": "old",
                        "document_name": "old.pdf",
                        "is_active": False,
                    },
                ],
            )

            results = store.search(
                "company",
                "fuse rating",
                5,
                allowed_document_ids={"current"},
            )

            self.assertEqual([item["document_id"] for item in results], ["current"])


if __name__ == "__main__":
    unittest.main()
