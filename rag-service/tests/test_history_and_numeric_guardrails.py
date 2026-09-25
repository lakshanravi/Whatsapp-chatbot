import unittest

from app.services.rag_engine import (
    RAGEngine,
    SALES_ASSISTANT_PROMPT,
    SUPPORT_DECISION_PROMPT,
    SYSTEM_PROMPT,
)


class HistoryAndNumericGuardrailTests(unittest.TestCase):
    def test_customer_answers_default_to_prose_not_tables(self):
        self.assertIn("Default to natural prose", SYSTEM_PROMPT)
        self.assertIn("Do not create a table", SYSTEM_PROMPT)
        self.assertIn("Keep citations unobtrusive", SYSTEM_PROMPT)

    def test_product_help_stays_relevant_and_inside_company_catalog(self):
        self.assertIn("a battery monitor is not an answer to a solar-panel request", SYSTEM_PROMPT)
        self.assertIn("Never direct the customer to another dealer", SYSTEM_PROMPT)
        self.assertIn("Never pad an answer with a loosely related product", SYSTEM_PROMPT)
        self.assertIn("Never ask a customer to provide this company's datasheet", SYSTEM_PROMPT)
        self.assertIn("Do not transfer a company knowledge-base gap", SYSTEM_PROMPT)

    def test_sales_assistant_is_helpful_but_grounded(self):
        self.assertIn("helpful in-store product specialist", SALES_ASSISTANT_PROMPT)
        self.assertIn("lead with one best-supported choice", SALES_ASSISTANT_PROMPT)
        self.assertIn("Do not add a sales pitch to a simple technical", SALES_ASSISTANT_PROMPT)
        self.assertIn("Never invent prices, stock, promotions", SALES_ASSISTANT_PROMPT)

    def test_support_agent_distinguishes_company_and_customer_information(self):
        self.assertIn("separate company-owned facts from customer-owned facts", SUPPORT_DECISION_PROMPT)
        self.assertIn("If the evidence answers the question, answer it now", SUPPORT_DECISION_PROMPT)
        self.assertIn("do not ask the customer to find it", SUPPORT_DECISION_PROMPT)
        self.assertIn("ask one easy question", SUPPORT_DECISION_PROMPT)

    def test_requirement_reply_keeps_previous_customer_need(self):
        self.assertTrue(RAGEngine._question_requires_history(
            "I need around 100Ah, 12V."
        ))

    def test_winter_battery_requirements_are_sufficient_to_search(self):
        self.assertTrue(RAGEngine._has_actionable_battery_requirements(
            "I need a battery for Canadian winters, around 100Ah and 12V."
        ))

    def test_real_customer_questions_receive_all_required_answer_modes(self):
        cases = [
            (
                "Can I wire two 400W panels in series, or will that fry the controller in winter?",
                {"compatibility", "safety_limits", "environmental_conditions"},
            ),
            (
                "My app shows Error 33 - PV over-voltage. Is it permanently dead?",
                {"troubleshooting_causes", "safety_limits"},
            ),
            (
                "What size fuse should I install between the controller and battery?",
                {"safety_limits", "calculation"},
            ),
            (
                "Does the MPPT talk to my SmartShunt over Bluetooth or VE.Direct?",
                {"compatibility", "communications"},
            ),
            (
                "How does sodium-ion compare with LiFePO4 in freezing weather?",
                {"comparison", "environmental_conditions"},
            ),
        ]

        for question, required_modes in cases:
            with self.subTest(question=question):
                self.assertTrue(
                    required_modes.issubset(set(RAGEngine._answer_modes(question)))
                )

    def test_winter_pv_question_prioritizes_exact_limit_searches(self):
        question = (
            "Can I wire two 400W panels in series into a Victron 100/20, "
            "or will that fry it in winter?"
        )
        modes = RAGEngine._answer_modes(question)
        queries = RAGEngine._critical_limit_search_queries(
            question, modes, {"10020"}
        )
        self.assertEqual(len(queries), 2)
        self.assertIn("maximum PV open circuit voltage", queries[0])
        self.assertIn("temperature coefficient", queries[1])
        self.assertIn("10020", queries[0])

    def test_exact_capacity_guard_rejects_different_product_capacity(self):
        required = RAGEngine._strict_capacity_signatures(
            "Can I mount the SunDale Heated 12V 200Ah battery on its side?"
        )
        self.assertEqual(required, {"200ah"})
        self.assertFalse(RAGEngine._candidate_matches_capacity(
            {
                "document_name": "SunDale Heated 12V 100Ah Datasheet.pdf",
                "content": "Nominal capacity 100Ah",
            },
            required,
        ))
        self.assertTrue(RAGEngine._candidate_matches_capacity(
            {
                "document_name": "SunDale Heated 12V 200Ah Manual.pdf",
                "content": "Installation instructions",
            },
            required,
        ))

    def test_approximate_capacity_need_does_not_force_exact_match(self):
        self.assertEqual(
            RAGEngine._strict_capacity_signatures(
                "I need around 100Ah at 12V for winter."
            ),
            set(),
        )

    def test_decimal_energy_capacity_is_normalized(self):
        self.assertEqual(
            RAGEngine._strict_capacity_signatures("Growatt 9.90kWh battery"),
            {"9.9kwh"},
        )

    def test_persisted_topic_scopes_a_generic_specification_follow_up(self):
        calls = []

        class EmptyStore:
            @staticmethod
            def company_has_documents(_company_id):
                return True

            @staticmethod
            def hybrid_query(_company_id, _question, _limit, **kwargs):
                calls.append(kwargs)
                return []

            @staticmethod
            def expand_neighbors(_company_id, retrieved, _radius, **_kwargs):
                return retrieved

        engine = RAGEngine.__new__(RAGEngine)
        engine.store = EmptyStore()
        engine.cross_encoder = None
        engine._standalone_question = lambda question, _history: question
        engine._multilingual_variants = lambda question: [question]
        engine._expand_query = lambda question: [question]
        engine._rerank = lambda _question, candidates, _limit: candidates

        response = engine.query(
            "company-id",
            "What is the operating temperature range?",
            history=[
                "user: What is the SureSine inverter?",
                "assistant: It is a pure sine wave inverter.",
            ],
            preferred_document_ids=["suresine-datasheet"],
            preferred_product_names=["suresine"],
        )

        self.assertTrue(calls)
        scoped_calls = [call for call in calls if call]
        self.assertTrue(scoped_calls)
        self.assertTrue(all(
            call["required_product_names"] == {"suresine"}
            and call["allowed_document_ids"] == {"suresine-datasheet"}
            for call in scoped_calls
        ))
        self.assertTrue(response.diagnostics.retrieval["document_scope_applied"])
        self.assertTrue(response.diagnostics.retrieval["product_filter_applied"])

    def test_document_overlap_supports_unknown_brand_without_manual_pattern(self):
        question = "What voltage does the Acme heated rack battery provide?"
        matching = "Acme 48V Heated Rack Battery/datasheet.pdf"
        unrelated = "Generic inverter installation manual.pdf"

        self.assertGreater(
            RAGEngine._document_query_overlap(question, matching),
            0,
        )
        self.assertEqual(
            RAGEngine._document_query_overlap(question, unrelated),
            0,
        )

    def test_explicit_new_model_drops_previous_product_history(self):
        history = [
            "user: What fuse does IC121040 use?",
            "assistant: It uses a 300 A fuse.",
        ]

        scoped = RAGEngine._scope_history_to_current_topic(
            "What fuse does IC1230150 use?",
            history,
        )

        self.assertEqual(scoped, [])

    def test_model_follow_up_keeps_only_current_topic(self):
        history = [
            "user: Tell me about IC121040",
            "assistant: Earlier product answer.",
            "user: Tell me about IC1230150",
            "assistant: Current product answer.",
        ]

        scoped = RAGEngine._scope_history_to_current_topic(
            "What fuse does it use?",
            history,
        )

        self.assertNotIn("IC121040", "\n".join(scoped))
        self.assertIn("IC1230150", "\n".join(scoped))

    def test_named_product_question_drops_unrelated_model_history(self):
        history = [
            "user: Where are the mounting holes on IC244090i?",
            "assistant: Check the technical drawing.",
        ]

        scoped = RAGEngine._scope_history_to_current_topic(
            "What is the SureSine inverter?",
            history,
        )

        self.assertEqual(scoped, [])

    def test_generic_follow_up_uses_latest_named_product_topic(self):
        history = [
            "user: Where are the mounting holes on IC244090i?",
            "assistant: Earlier product answer.",
            "user: What is the SureSine inverter?",
            "assistant: SureSine is a pure sine wave inverter.",
        ]

        scoped = RAGEngine._scope_history_to_current_topic(
            "What AC output versions are available?",
            history,
        )

        joined = "\n".join(scoped)
        self.assertNotIn("IC244090i", joined)
        self.assertIn("SureSine", joined)

    def test_supported_system_voltage_question_requires_history(self):
        self.assertTrue(RAGEngine._question_requires_history(
            "What system voltages are supported?"
        ))

    def test_controller_self_consumption_question_requires_history(self):
        self.assertTrue(RAGEngine._question_requires_history(
            "What is the controller self-consumption?"
        ))

    def test_operating_temperature_question_requires_history(self):
        self.assertTrue(RAGEngine._question_requires_history(
            "What is the operating temperature range?"
        ))

    def test_generic_efficiency_question_requires_history(self):
        self.assertTrue(RAGEngine._question_requires_history(
            "What is the peak efficiency?"
        ))

    def test_generic_l_model_purpose_question_requires_history(self):
        self.assertTrue(RAGEngine._question_requires_history(
            "What is the purpose of low-voltage load disconnect on L models?"
        ))

    def test_generic_safety_rule_question_requires_history(self):
        self.assertTrue(RAGEngine._question_requires_history(
            "What safety rule applies to the PV array voltage?"
        ))

    def test_short_technical_fact_reply_keeps_previous_topic(self):
        self.assertTrue(RAGEngine._question_requires_history(
            "I have a 12V battery and the solar panel is clean."
        ))

    def test_model_list_question_is_detected(self):
        self.assertTrue(RAGEngine._is_model_list_question(
            "What SunSaver models are available?"
        ))
        self.assertFalse(RAGEngine._is_model_list_question(
            "What voltage is available?"
        ))

    def test_named_product_family_question_starts_a_new_topic(self):
        self.assertFalse(RAGEngine._question_requires_history(
            "What system voltages does SunSaver support?"
        ))

    def test_duplicate_chunks_from_one_pdf_become_one_display_source(self):
        chunks = [
            {"document_id": "sun", "document_name": "operation-manual-.pdf", "page": 2},
            {"document_id": "sun", "document_name": "operation-manual-.pdf", "page": 23},
            {"document_id": "other", "document_name": "other.pdf", "page": 1},
        ]

        deduplicated = RAGEngine._deduplicate_source_documents(chunks)

        self.assertEqual([item["document_id"] for item in deduplicated], ["sun", "other"])

    def test_wrong_numeric_value_is_rejected(self):
        retrieved = [{"content": "The IC1230150 fuse rating is 450 A."}]

        unsupported = RAGEngine._unsupported_numeric_claims(
            "The required fuse is 300A [Source 1].",
            retrieved,
        )

        self.assertEqual(unsupported, [("", "300", "a")])

    def test_voltage_suffix_inside_model_id_is_not_a_numeric_claim(self):
        claims = RAGEngine._numeric_claims(
            "Models SS-6-12V, SS-10L-24V, and SI-300-115V-UL are available."
        )

        self.assertEqual(claims, set())

    def test_invented_model_id_is_rejected_against_cited_source(self):
        retrieved = [{
            "content": "Models included: SS-6-12V and SS-20L-24V."
        }]

        unsupported = RAGEngine._unsupported_model_ids(
            "Models are SS-6-12V and SS-30L-24V [Source 1].",
            retrieved,
        )

        self.assertEqual(unsupported, ["SS30L24V"])

    def test_model_explicitly_supplied_by_user_is_allowed_in_answer(self):
        retrieved = [{"content": "PV voltage must exceed battery voltage."}]

        unsupported = RAGEngine._unsupported_model_ids(
            "For your SmartSolar 75/10, check PV voltage [Source 1].",
            retrieved,
            allowed_model_ids={"7510"},
        )

        self.assertEqual(unsupported, [])

    def test_uncited_numeric_value_is_rejected(self):
        retrieved = [{"content": "The fuse rating is 450 A."}]

        unsupported = RAGEngine._unsupported_numeric_claims(
            "The fuse rating is 450 A.",
            retrieved,
        )

        self.assertEqual(unsupported, [("", "450", "a")])

    def test_supported_numeric_value_and_dimensions_are_accepted(self):
        retrieved = [{
            "content": (
                "Fuse: 450 A. Dimensions: 464 x 300 x 155 mm. Threshold: >3.0 V. "
                "Input: 120/240 VAC. Warranty: two years."
            )
        }]

        unsupported = RAGEngine._unsupported_numeric_claims(
            "It uses a 450A fuse and measures 464 × 300 × 155 mm [Source 1]. "
            "The threshold is above 3.0V [Source 1]. Input is 120 VAC [Source 1]. "
            "The warranty is 2-year [Source 1].",
            retrieved,
        )

        self.assertEqual(unsupported, [])

    def test_paragraph_level_citation_supports_all_numeric_sentences(self):
        retrieved = [{
            "content": (
                "Continuous Power Rating: 300 Watts at 25°C. "
                "AC output versions: 115 VAC at 60 Hz or 220 VAC at 50 Hz."
            )
        }]

        unsupported = RAGEngine._unsupported_numeric_claims(
            "Continuous power is 300 W at 25°C. Output versions are 115 VAC at "
            "60 Hz and 220 VAC at 50 Hz. [Source 1]",
            retrieved,
        )

        self.assertEqual(unsupported, [])

    def test_numeric_claim_can_use_another_retrieved_chunk_from_cited_document(self):
        retrieved = [
            {
                "document_id": "suresine",
                "content": "Versions: SI-300-115V-UL and SI-300-220V.",
            },
            {
                "document_id": "suresine",
                "content": "Two versions: 220VAC at 50 Hz or 115VAC at 60 Hz.",
            },
        ]

        unsupported = RAGEngine._unsupported_numeric_claims(
            "The outputs are 115 VAC at 60 Hz and 220 VAC at 50 Hz [Source 1].",
            retrieved,
        )

        self.assertEqual(unsupported, [])

    def test_numeric_claim_cannot_use_an_uncited_other_document(self):
        retrieved = [
            {
                "document_id": "correct-product",
                "content": "The fuse rating is 450 A.",
            },
            {
                "document_id": "other-product",
                "content": "The fuse rating is 300 A.",
            },
        ]

        unsupported = RAGEngine._unsupported_numeric_claims(
            "The fuse rating is 300 A [Source 1].",
            retrieved,
        )

        self.assertEqual(unsupported, [("", "300", "a")])

    def test_unicode_comparators_and_dimensions_are_normalized(self):
        claims = RAGEngine._numeric_claims(
            "Threshold ≥3.0 V; enclosure 213 × 152 × 105 mm."
        )

        self.assertIn((">=", "3", "v"), claims)
        self.assertIn(("", "213", "mm"), claims)

    def test_only_sentence_with_unsupported_number_is_removed(self):
        answer = (
            "Check the PV wiring first [Source 1]. "
            "The controller starts at 9 V [Source 1]. "
            "Also inspect the connectors [Source 2]."
        )

        cleaned = RAGEngine._remove_unsupported_numeric_sentences(
            answer, [("", "9", "v")]
        )

        self.assertIn("Check the PV wiring", cleaned)
        self.assertNotIn("9 V", cleaned)
        self.assertIn("inspect the connectors", cleaned)

    def test_numeric_removal_does_not_leave_an_empty_numbered_item(self):
        answer = "9. Supported check [Source 1].\n10. Unsupported value is 99 V [Source 1]."

        cleaned = RAGEngine._remove_unsupported_numeric_sentences(
            answer, [("", "99", "v")]
        )

        self.assertIn("Supported check", cleaned)
        self.assertNotIn("10.", cleaned)


if __name__ == "__main__":
    unittest.main()
