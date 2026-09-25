import unittest

from app.services.model_ids import (
    extract_model_ids,
    item_model_ids,
    matches_model_ids,
    normalize_model_id,
)


class ModelIdTests(unittest.TestCase):
    def test_spacing_and_hyphens_are_normalized(self):
        self.assertEqual(normalize_model_id("IC 121040-I"), "IC121040I")
        self.assertEqual(
            extract_model_ids("Compare IC 121040 with IC121040I."),
            {"IC121040", "IC121040I"},
        )

    def test_f3000_customer_aliases_resolve_to_manual_model(self):
        self.assertEqual(normalize_model_id("PEC-F3000LFP"), "F3000LFP")
        self.assertEqual(
            extract_model_ids(
                "What's the expected cycle life of this PEC-F3000LFP unit?"
            ),
            {"F3000LFP"},
        )

    def test_pecron_lfp_aliases_generalize_to_other_models(self):
        self.assertEqual(normalize_model_id("PEC-F5000LFP"), "F5000LFP")
        self.assertEqual(normalize_model_id("PECRON E1500 LFP"), "E1500LFP")
        self.assertEqual(
            extract_model_ids(
                "PECRON_F5000_LFP_user_manual_100V_120V_V2-20260106.pdf"
            ),
            {"F5000LFP"},
        )
        self.assertEqual(
            extract_model_ids("PECRON E3600 LFP Datasheet.pdf"),
            {"E3600LFP"},
        )

    def test_pecron_vendor_prefix_is_removed_from_other_model_families(self):
        self.assertEqual(normalize_model_id("PEC-EP3800-48V"), "EP380048V")
        self.assertEqual(normalize_model_id("PECRON EP3000-48V"), "EP300048V")
        self.assertEqual(
            extract_model_ids(
                "What battery chemistry does the PEC-EP3800-48V use?"
            ),
            {"EP380048V"},
        )
        self.assertEqual(
            extract_model_ids(
                "PECRON_F3000_LFP_user_manual_100V_120V_V2-20260310.pdf"
            ),
            {"F3000LFP"},
        )

    def test_similar_models_remain_distinct(self):
        metadata = {"document_name": "IC121040I user manual.pdf"}

        self.assertFalse(matches_model_ids(
            "Inverter specifications",
            metadata,
            {"IC121040"},
        ))
        self.assertTrue(matches_model_ids(
            "Inverter specifications",
            metadata,
            {"IC121040I"},
        ))

    def test_filename_owns_document_even_when_another_model_is_mentioned(self):
        metadata = {"document_name": "IC121040I user manual.pdf"}

        self.assertEqual(
            item_model_ids("For comparison, see IC121040.", metadata),
            {"IC121040I"},
        )

    def test_filename_repairs_incorrect_legacy_chunk_metadata(self):
        metadata = {
            "document_name": (
                "PECRON_F3000_LFP_user_manual_100V_120V_V2-20260310.pdf"
            ),
            "model_ids": "XT60,XT120",
        }

        self.assertEqual(
            item_model_ids(
                "Cycle Life maintains over 80% capacity after 3500 cycles.",
                metadata,
            ),
            {"F3000LFP"},
        )

    def test_error_and_certification_codes_are_not_models(self):
        self.assertEqual(
            extract_model_ids(
                "Error E05 at 10.5V, fuse 450A, RS485, RJ45, ingress IP20, "
                "and UL9540A certification"
            ),
            set(),
        )

    def test_long_hyphenated_models_are_supported(self):
        self.assertIn(
            "S6GC30KLVUS",
            extract_model_ids("Use the S6-GC30K-LV-US installation manual."),
        )

    def test_suresine_versions_are_models_but_standards_and_addresses_are_not(self):
        self.assertEqual(
            extract_model_ids(
                "SureSine SI-300-115V-UL and SI-300-220V comply with "
                "EN 60950-1. The office is in Newtown, PA 18940."
            ),
            {"SI300115VUL", "SI300220V"},
        )

    def test_manual_metadata_and_threshold_codes_are_not_models(self):
        self.assertEqual(
            extract_model_ids(
                "NFPA70, ETL24ATEX0421X, MS003243EN, FEB15, AGM12, "
                "EARTH12V, and LVD11"
            ),
            set(),
        )

    def test_victron_slash_models_are_recognized_with_product_context(self):
        self.assertEqual(
            extract_model_ids(
                "Can I use a Victron SmartSolar MPPT 75/10 or an Orion 12/12-30?"
            ),
            {"7510", "121230"},
        )

    def test_slash_voltage_specification_is_not_a_model(self):
        self.assertNotIn(
            "120240",
            extract_model_ids("The inverter supports 120/240 VAC output."),
        )

    def test_legacy_metadata_is_augmented_with_slash_model_from_content(self):
        self.assertIn(
            "7510",
            item_model_ids(
                "Victron SmartSolar MPPT 75/10 specifications",
                {"model_ids": "MPPT75"},
            ),
        )


if __name__ == "__main__":
    unittest.main()
