import unittest
from types import SimpleNamespace

from app.services.rag_engine import RAGEngine


class ClarificationGuardrailTests(unittest.TestCase):
    def test_only_fully_unclear_questions_allow_choice_buttons(self):
        self.assertTrue(RAGEngine._is_fully_unclear_question("Tell me more"))
        self.assertTrue(RAGEngine._is_fully_unclear_question("What about that one?"))
        self.assertFalse(RAGEngine._is_fully_unclear_question(
            "What is the warranty period for Model X?"
        ))
        self.assertFalse(RAGEngine._is_fully_unclear_question(
            "Which panel is best for a 10 kW off-grid system?"
        ))

    def test_common_factual_forms_bypass_clarification(self):
        factual_questions = [
            "What is the warranty period for IC1220100?",
            "Does model IC1230150 use a 450A fuse?",
            "Can the controller operate in harsh environments?",
            "How much charging current does IC122055I provide?",
            "What AC output versions are available?",
            (
                "I am preparing to install my IC244090i inverter on a custom mounting "
                "board. Where are the mounting holes located on this specific unit?"
            ),
            "Where is the communication port?",
            "Which port connects the BTS cable?",
            "What is the difference between IC121040 and IC121040I?",
        ]

        for question in factual_questions:
            with self.subTest(question=question):
                self.assertTrue(RAGEngine._is_clear_factual_question(question))

        self.assertFalse(RAGEngine._is_clear_factual_question(
            "Which controller is best for my off-grid system?"
        ))

    def test_diverse_support_question_forms_retrieve_before_clarifying(self):
        questions = [
            "Why is my SmartSolar 75/10 not turning on until the sun is high?",
            "Can I wire two panels in series?",
            "Will that fry the controller in cold weather?",
            "How do I configure the battery preset?",
            "What happens during PV overcurrent?",
        ]
        for question in questions:
            with self.subTest(question=question):
                self.assertTrue(RAGEngine._is_clear_factual_question(question))

    def test_multi_part_question_has_multiple_answer_modes(self):
        modes = RAGEngine._answer_modes(
            "Can I wire two panels in series, will it fry the controller, "
            "and why are there no load terminals?"
        )

        self.assertIn("compatibility", modes)
        self.assertIn("safety_limits", modes)
        self.assertIn("troubleshooting_causes", modes)
        self.assertIn("behavior", modes)

    def test_question_payload_is_removed(self):
        options = RAGEngine._sanitize_clarification_options(
            "What will you use the product for?",
            [{"label": "Solar installation", "message": "What will you use it for?"}],
        )

        self.assertEqual(options, [])

    def test_declarative_payload_is_made_first_person(self):
        options = RAGEngine._sanitize_clarification_options(
            "Which installation is this for?",
            [{"label": "Commercial", "message": "Commercial solar installation"}],
        )

        self.assertEqual(
            options[0]["message"],
            "My answer is: Commercial solar installation.",
        )

    def test_duplicate_labels_are_removed(self):
        options = RAGEngine._sanitize_clarification_options(
            "Which product type?",
            [
                {"label": "Panels", "message": "I need panels."},
                {"label": "panels", "message": "I want solar panels."},
            ],
        )

        self.assertEqual(len(options), 1)

    def test_questionnaire_heading_options_are_removed(self):
        options = RAGEngine._sanitize_clarification_options(
            "What do you need for the recommendation?",
            [
                {"label": "Usage", "message": "What will you use it for?"},
                {"label": "Budget", "message": "What is your price range?"},
                {"label": "Solar installation", "message": "I need it for solar installation."},
            ],
        )

        self.assertEqual([option["label"] for option in options], ["Solar installation"])

    def test_instruction_payload_is_removed(self):
        options = RAGEngine._sanitize_clarification_options(
            "Which installation is this for?",
            [{"label": "Residential solar", "message": "Please choose an installation"}],
        )

        self.assertEqual(options, [])

    def test_requirements_need_verbatim_customer_evidence(self):
        requirements = RAGEngine._validated_known_requirements(
            [
                {
                    "requirement": "intended use",
                    "value": "outdoor use",
                    "evidence": "I need it for outdoor use",
                },
                {
                    "requirement": "budget",
                    "value": "under 500",
                    "evidence": "Your budget is under 500",
                },
            ],
            "I need it for outdoor use",
        )

        self.assertEqual(len(requirements), 1)
        self.assertEqual(requirements[0]["value"], "outdoor use")

    def test_recommendation_without_user_needs_forces_clarification(self):
        payload = SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content=(
                '{"intent":"unclear","scenario_summary":"assumed need",'
                '"known_requirements":[],"missing_requirements":["intended outcome"],'
                '"sufficient":true,"clarification_question":"",'
                '"clarification_options":[],"no_more_information":false}'
            )))]
        )
        engine = RAGEngine.__new__(RAGEngine)
        engine.openai = SimpleNamespace(
            chat=SimpleNamespace(
                completions=SimpleNamespace(create=lambda **_kwargs: payload)
            )
        )

        analysis = engine._analyze_request(
            "Which one should I select?",
            ["assistant: Product A and Product B are available."],
            "[Catalog] Product A. Product B.",
        )

        self.assertFalse(analysis["sufficient"])
        self.assertEqual(analysis["intent"], "recommendation")
        self.assertEqual(analysis["scenario_summary"], "")
        self.assertIn("outcome", analysis["clarification_question"].lower())

    def test_verifier_commentary_is_removed(self):
        answer = (
            "Product A is suitable for indoor use. "
            "The mention of Product B is unsupported in the provided context and should be removed. "
            "Product A includes a two-year warranty [Source 1]."
        )

        cleaned = RAGEngine._remove_verifier_commentary(answer)

        self.assertNotIn("unsupported", cleaned.lower())
        self.assertNotIn("should be removed", cleaned.lower())
        self.assertIn("Product A is suitable", cleaned)
        self.assertIn("two-year warranty", cleaned)

    def test_current_clarification_rounds_are_counted(self):
        history = [
            "assistant: Here is an earlier factual answer.",
            "user: Recommend a product",
            "assistant: What will you use it for?",
            "user: Solar installation",
            "assistant: What type of installation is it?",
        ]

        self.assertEqual(RAGEngine._clarification_round_count(history), 2)

    def test_similar_clarification_is_detected(self):
        history = [
            "user: Recommend a product",
            "assistant: What type of installation are you referring to?",
        ]

        self.assertTrue(RAGEngine._is_repeated_clarification(
            "What type of installation is this for?",
            history,
        ))

    def test_distinct_clarification_is_allowed(self):
        history = [
            "assistant: What will you use the product for?",
            "user: Solar installation",
        ]

        self.assertFalse(RAGEngine._is_repeated_clarification(
            "What inverter voltage must it support?",
            history,
        ))

    def test_query_does_not_ask_a_third_clarification(self):
        class EmptyStore:
            @staticmethod
            def company_has_documents(_company_id):
                return True

            @staticmethod
            def hybrid_query(_company_id, _question, _limit, **_kwargs):
                return []

            @staticmethod
            def expand_neighbors(_company_id, retrieved, _neighbor_chunks, **_kwargs):
                return retrieved

        engine = RAGEngine.__new__(RAGEngine)
        engine.store = EmptyStore()
        engine.cross_encoder = None
        engine._analyze_request = lambda _question, _history, _catalog_context: {
            "intent": "recommendation",
            "scenario_summary": "Solar installation",
            "known_requirements": [
                {
                    "requirement": "intended use",
                    "value": "Solar installation",
                    "evidence": "I need it for solar installation",
                }
            ],
            "missing_requirements": ["compatibility"],
            "sufficient": False,
            "clarification_question": "What mounting surface will you use?",
            "clarification_options": [],
            "no_more_information": False,
        }
        engine._standalone_question = lambda question, _history: question
        engine._multilingual_variants = lambda question: [question]
        engine._expand_query = lambda question: [question]
        engine._rerank = lambda _question, candidates, _limit: candidates

        response = engine.query(
            "company-id",
            "I need it for solar installation",
            history=[
                "user: Recommend a product",
                "assistant: What will you use it for?",
                "user: Solar installation",
                "assistant: What product type do you need?",
            ],
        )

        self.assertEqual(response.suggestions, [])
        self.assertNotIn("?", response.answer)
        self.assertTrue(response.diagnostics.retrieval["clarification_exhausted"])

    def test_repeated_second_question_becomes_final_missing_details_request(self):
        class EmptyStore:
            @staticmethod
            def company_has_documents(_company_id):
                return True

            @staticmethod
            def hybrid_query(_company_id, _question, _limit, **_kwargs):
                return []

        analysis = {
            "intent": "recommendation",
            "scenario_summary": "intended use: outdoor use",
            "known_requirements": [{
                "requirement": "intended use",
                "value": "outdoor use",
                "evidence": "I need it outdoors",
            }],
            "missing_requirements": ["required capacity", "operating conditions"],
            "sufficient": False,
            "clarification_question": "What conditions will you use it in?",
            "clarification_options": [],
            "no_more_information": False,
        }
        engine = RAGEngine.__new__(RAGEngine)
        engine.store = EmptyStore()
        engine.cross_encoder = None
        engine._standalone_question = lambda question, _history: question
        engine._analyze_request = lambda *_args, **_kwargs: dict(analysis)

        response = engine.query(
            "company-id",
            "I need it outdoors",
            history=[
                "user: Help me choose",
                "assistant: What conditions will you use it in?",
            ],
        )

        self.assertFalse(response.diagnostics.retrieval["clarification_exhausted"])
        self.assertIn("required capacity", response.answer)
        self.assertIn("operating conditions", response.answer)


if __name__ == "__main__":
    unittest.main()
