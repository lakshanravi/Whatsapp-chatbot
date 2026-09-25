import unittest

from app.services.product_names import (
    extract_product_names,
    matches_product_names,
    normalize_product_name,
)


class ProductNameTests(unittest.TestCase):
    def test_camel_case_product_families_are_extracted(self):
        self.assertEqual(
            extract_product_names("Compare SunSaver with SureSine."),
            {"sunsaver", "suresine"},
        )

    def test_ordinary_title_case_words_are_not_product_filters(self):
        self.assertEqual(
            extract_product_names("What System Voltages Are Supported?"),
            set(),
        )

    def test_persisted_family_matches_normalized_question_name(self):
        self.assertTrue(matches_product_names(
            "System voltage is 12 or 24 V.",
            {"product_names": "sunsaver"},
            {"sunsaver"},
        ))

    def test_volthium_title_case_name_scopes_legacy_datasheet(self):
        question = (
            "What voltage and capacity does the Volthium heated rack battery provide?"
        )
        metadata = {
            "document_name": (
                "VOL-51.2-100-R-H-3U-C_ Volthium 48V 100Ah Rack Mount "
                "Heated Battery/datasheet.pdf"
            ),
            "product_names": "",
        }

        self.assertEqual(extract_product_names(question), {"volthium"})
        self.assertTrue(matches_product_names(
            "Voltage 51.2 V; Capacity 100 Ah; Energy 5120 Wh.",
            metadata,
            {"volthium"},
        ))

    def test_solark_and_luxpowertek_comparison_detects_both_brands(self):
        question = (
            "What's the difference between a Sol-Ark inverter and a "
            "LuxpowerTek inverter?"
        )

        self.assertEqual(
            extract_product_names(question),
            {"solark", "luxpowertek"},
        )
        self.assertEqual(normalize_product_name("Lux Power"), "luxpowertek")

    def test_legacy_noisy_product_metadata_is_augmented_from_content(self):
        self.assertTrue(matches_product_names(
            "The Sol-Ark inverter includes integrated surge protection.",
            {
                "document_name": "Datasheet.pdf",
                "product_names": "overcurr",
            },
            {"solark"},
        ))

    def test_support_brands_are_available_as_query_scopes(self):
        self.assertEqual(
            extract_product_names(
                "Compare PECRON, Victron Energy, MidNite Solar, SRNE, and Morningstar."
            ),
            {"pecron", "victron", "midnitesolar", "srne", "morningstar"},
        )


if __name__ == "__main__":
    unittest.main()
