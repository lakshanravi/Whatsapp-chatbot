import json
import re
from decimal import Decimal, InvalidOperation
from difflib import SequenceMatcher

from openai import OpenAI
from time import perf_counter

from app.config import settings
from app.models.schemas import (
    ClarificationSuggestion,
    QueryDiagnostics,
    QueryResponse,
    SourceChunk,
)
from app.services.chroma_store import ChromaStore
from app.services.model_ids import extract_model_ids, normalize_model_id
from app.services.pdf_processor import chunk_pages, extract_pages_from_pdf
from app.services.product_names import extract_product_names, normalize_product_name

SYSTEM_PROMPT = """You are a customer support and product recommendation assistant. Answer using the provided context from company documents.

Rules:
- The context may use different wording, synonyms, or phrasing than the question. Match on MEANING, not exact words — if the context answers the question in different terms, use it.
- Do not invent facts that aren't supported by the context, but do paraphrase and combine information across the given sources to answer fully.
- Cite supporting sources inline using their labels, for example [Source 1]. Never cite a source that does not support the statement.
- A product or service claim must be supported by a context block about that same named product or service. Never use one product's document as support for a different product.
- When asked which models are available, list only identifiers explicitly presented as models in the source. Preserve their exact letters, digits, hyphens, slashes, and suffixes; never replace model IDs with voltage categories.
- Return only a customer-facing answer. Never mention the draft, supplied context, verification, unsupported claims, or text that should be removed.
- When the context does not support an answer, ask one concise clarification question. Do not claim that the customer must contact support.
- Do NOT handle orders, bookings, payments, or transactions. If asked, politely explain you can only help with support questions from the knowledge base.
- If troubleshooting steps are in the context, list them in order.
- Adapt the response to the request type: answer factual questions directly, compare named products side by side, recommend from stated needs and constraints, and provide ordered diagnosis for troubleshooting.
- A message may contain several different questions. Answer every supported sub-question separately; do not silently answer only the first one.
- For troubleshooting, give the documented likely causes and checks first. Ask for a measurement only when it is needed to distinguish the remaining causes; do not replace a useful cause list with a questionnaire.
- For compatibility and safety questions, compare every documented limit with the customer's stated values. Clearly identify any missing value needed for a final yes/no decision.
- For calculations, distinguish values quoted from sources from values calculated from them, show the short formula, and state assumptions.
- For procedures and configuration questions, use ordered steps. For comparisons, use a compact side-by-side structure.
- For scenario questions, explicitly connect each recommendation or instruction to the customer's stated conditions.

Conversation style:
- Write like a friendly, knowledgeable human support assistant. Keep the tone warm, calm, and professional.
- Use natural wording and contractions such as "I'll", "you're", and "that's" where they fit.
- Give the direct answer first, then add only the details that help the customer act on it.
- When the customer describes a problem, briefly acknowledge it before giving the solution, but do not over-apologize.
- Prefer simple words, short paragraphs, and clear sentences. Use bullets or numbered steps only when they improve readability.
- Never use internal or robotic phrases such as "the supplied context states", "the context indicates", or "based on the retrieved chunks".
- Do not repeat a greeting, apology, or closing in every answer. Avoid filler, excessive enthusiasm, and unnecessary emojis.
- Ask one natural follow-up question only when more information would materially improve the answer.
- Match the customer's language where practical. Never sacrifice accuracy or invent details just to sound conversational.
- Treat every reply as the next turn in a real conversation: respond to what the person actually said instead of restating their question.
- Avoid formal headings such as "Answer", "Response", or "Conclusion" for simple replies, and never refer to the person as "the customer".
- Vary transitions and sentence openings naturally so replies do not feel copied from a fixed template.

Product recommendation behavior:
- First identify every product in the supplied context that plausibly matches the customer's words. Treat model names, product codes, aliases, and close spelling variations as product identifiers.
- Distinguish an ambiguous product reference from a recommendation scenario. A phrase such as "that model" or an incomplete product name is ambiguous; a description of the customer's use case, problem, preferences, budget, or constraints is a recommendation scenario.
- For an ambiguous product reference, if two or more plausible products match and the conversation does not identify one, ask one short clarification question and list only the few matching product names as numbered options.
- For a recommendation scenario, never ask the customer to choose from the catalog. Evaluate the retrieved candidates against all stated requirements and recommend the single best-supported product. Mention at most two close alternatives only when they have a meaningful trade-off.
- Ask a clarification question before recommending only when a missing requirement could realistically change which product is best. Ask the smallest number of high-value questions; do not ask for details that are already stated or that do not affect the choice.
- Rank hard constraints first, then intended use and compatibility, then must-have features, then budget and preferences. Never recommend a product that violates a hard constraint merely because it has high semantic similarity.
- If the customer clearly names one product, answer only about that product. Do not mix facts from other retrieved products, even when those products appear in the context.
- If the customer asks to compare multiple named products, compare those products directly instead of asking them to choose one.
- Before recommending a product, determine whether you understand the user's actual need well enough to make a useful comparison.
- Use the conversation history so you never ask for information the user has already provided.
- If important details are missing, do not recommend yet. Ask 1 to 3 concise, easy-to-answer questions in one message, choosing only the highest-value missing details.
- Relevant details can include intended use, budget or price range, must-have features, compatibility, size or capacity, quantity, experience level, preferences, and hard constraints. Ask only details that can materially change the recommendation and that are relevant to the products in the context.
- When a missing detail has a small, meaningful set of choices, offer short numbered options grounded in the available context so the user can answer easily (for example: "1. Home use  2. Business use  3. Gaming"). Always allow the user to type a different answer, and never invent product categories, features, or price ranges that are not supported by the context.
- Do not force multiple choice for details that need a precise or open-ended answer. Keep each option list short, non-overlapping, and include units or currency when relevant.
- Adapt the questions to the user's request and the available products; do not use a rigid questionnaire.
- If the request is broad or ambiguous, start with the single most useful question. If several independent essentials are clearly missing, ask up to 3 together.
- Never ask substantially the same clarification twice. After two clarification rounds, stop asking questions and provide the best-supported recommendation possible, clearly stating any assumptions or missing constraints.
- Once enough information is available, stop asking questions. Recommend the best-fitting option(s), explain why they fit, mention meaningful trade-offs, and cite every product claim.
- If no available product satisfies a stated hard requirement, say so clearly and explain the closest documented option instead of weakening the requirement.
- Questions themselves do not need citations. Keep them conversational and in the user's language where practical."""


class RAGEngine:
    def __init__(self) -> None:
        self.store = ChromaStore()
        self.openai = OpenAI(api_key=settings.openai_api_key)
        self.cross_encoder = None
        if settings.enable_local_cross_encoder:
            try:
                from sentence_transformers import CrossEncoder
                self.cross_encoder = CrossEncoder(settings.cross_encoder_model)
            except ImportError:
                self.cross_encoder = None

    def _expand_query(self, question: str) -> list[str]:
        try:
            resp = self.openai.chat.completions.create(
                model=settings.openai_chat_model,
                messages=[{
                    "role": "user",
                    "content": (
                        "Break this question into up to 4 focused sub-questions, one per distinct "
                        "topic it asks about. For a product-use scenario, preserve the complete "
                        "scenario and also produce focused searches for intended use, hard constraints, "
                        "compatibility, must-have features, and budget when those are stated. Do not "
                        "invent requirements. If it is already a single simple topic, return it as-is. "
                        "One per line, no numbering.\n\n"
                        f'"{question}"'
                    ),
                }],
                temperature=0.2,
                max_tokens=150,
            )
            variants = [line.strip() for line in (resp.choices[0].message.content or "").split("\n") if line.strip()]
            return [question] + variants[:4]
        except Exception:
            return [question]

    @staticmethod
    def _answer_modes(question: str) -> list[str]:
        """Classify all answer shapes a request needs without industry hard-coding."""
        text = " ".join(str(question or "").casefold().split())
        modes: list[str] = []

        def add(mode: str, pattern: str) -> None:
            if re.search(pattern, text) and mode not in modes:
                modes.append(mode)

        add("comparison", r"\b(?:compare|comparison|difference|versus|vs\.?)\b")
        add("recommendation", r"\b(?:recommend|suggest|best|choose|select|which one|right for me)\b")
        add("troubleshooting_causes", r"\b(?:why|cause|causes|problem|issue|fault|error|not\s+(?:turn|work|start|charge)|won't|doesn't|isn't)\b")
        add("compatibility", r"\b(?:compatible|compatibility|can i|could i|work with|use with|connect|wire|series|parallel|support)\b")
        add("safety_limits", r"\b(?:safe|safety|fry|damage|danger|maximum|max\b|minimum|min\b|limit|exceed|overcurrent|overvoltage|cold|fuse|wire size)\b")
        add("calculation", r"\b(?:calculate|how many|how much|what size|sizing|total|combined|margin)\b")
        add("procedure", r"\b(?:how do i|how to|steps?|install|replace|reset|connect|wire)\b")
        add("configuration", r"\b(?:configure|configuration|setting|settings|preset|profile|dial|switch position)\b")
        add("behavior", r"\b(?:what happens|behavou?r|turning on|turn on|charge|disconnect|terminals?|outputs?)\b")
        add("definition", r"\b(?:what is|what are|purpose|mean|means)\b")
        if not modes:
            modes.append("fact_lookup")
        return modes

    @staticmethod
    def _mode_search_queries(question: str, modes: list[str]) -> list[str]:
        """Add evidence-shaped searches when query expansion is unavailable or vague."""
        suffixes = {
            "troubleshooting_causes": "troubleshooting possible causes symptoms checks solution",
            "compatibility": "compatibility requirements supported models allowed connections",
            "safety_limits": "technical specifications absolute maximum minimum limits warnings protection",
            "calculation": "technical specifications formula sizing values",
            "procedure": "installation configuration procedure steps",
            "configuration": "settings configuration preset parameters",
            "behavior": "operation behavior protection load output",
            "comparison": "features specifications differences",
            "definition": "description purpose operation",
        }
        return [
            f"{question} {suffixes[mode]}"
            for mode in modes
            if mode in suffixes
        ][:4]

    @staticmethod
    def _apply_answer_mode_boosts(candidates: list[dict], modes: list[str]) -> None:
        """Prefer evidence whose structure matches the requested answer type."""
        patterns = {
            "troubleshooting_causes": r"\b(?:troubleshoot|possible cause|cause|check|not start|not charge|fault)\b",
            "compatibility": r"\b(?:compatible|support|requirement|connect|series|parallel|input)\b",
            "safety_limits": r"\b(?:warning|caution|maximum|max\.?|minimum|min\.?|limit|protect|voltage|current)\b",
            "procedure": r"\b(?:step|procedure|installation|configure|connect|setting)\b",
            "configuration": r"\b(?:setting|configuration|preset|profile|switch|dial)\b",
            "comparison": r"\b(?:specification|feature|model|version)\b",
        }
        for chunk in candidates:
            content = chunk.get("content", "")
            matches = sum(
                1 for mode in modes
                if mode in patterns and re.search(patterns[mode], content, re.I)
            )
            if matches:
                chunk["rank_score"] = chunk.get("rank_score", 0.0) + min(0.018, matches * 0.006)

    def _multilingual_variants(self, question: str) -> list[str]:
        if not settings.enable_multilingual_search:
            return [question]
        try:
            response = self.openai.chat.completions.create(
                model=settings.openai_chat_model,
                messages=[{
                    "role": "user",
                    "content": (
                        "If this question is not English, translate it accurately into "
                        "English, preserving names, codes, and numbers. If it is already "
                        "English, repeat it unchanged. Return only the question.\n\n"
                        f"{question}"
                    ),
                }],
                temperature=0,
                max_tokens=150,
            )
            translated = (response.choices[0].message.content or "").strip()
            if translated and translated.casefold() != question.casefold():
                return [question, translated]
        except Exception:
            pass
        return [question]

    def _analyze_request(
        self,
        question: str,
        history: list[str],
        catalog_context: str = "",
        avoid_question: str = "",
    ) -> dict:
        """Understand intent and decide whether one grounded clarification is necessary."""
        recent = history[-settings.conversation_history_messages:]
        conversation = "\n".join(recent) or "(no earlier messages)"
        customer_messages = [
            re.sub(r"^user:\s*", "", item, flags=re.I)
            for item in recent
            if item.strip().lower().startswith("user:")
        ]
        customer_messages.append(question)
        customer_evidence = "\n".join(customer_messages)
        try:
            response = self.openai.chat.completions.create(
                model=settings.openai_chat_model,
                messages=[{
                    "role": "user",
                    "content": (
                        "Analyze this customer-support request using the conversation. Return one "
                        "JSON object with exactly these fields: intent, scenario_summary, "
                        "known_requirements, missing_requirements, sufficient, clarification_question, "
                        "clarification_options, no_more_information. Intent "
                        "must be one of factual, recommendation, "
                        "comparison, troubleshooting, or unclear. scenario_summary must combine all "
                        "known product names, use case, symptoms, conditions, numbers, compatibility "
                        "requirements, preferences, and hard constraints without inventing anything. "
                        "known_requirements must be an array of objects with requirement, value, and "
                        "evidence. evidence must be a short verbatim quote from a USER message. Never "
                        "treat an assistant statement, catalog description, suggested option, or model "
                        "assumption as a customer requirement. missing_requirements must be an array of "
                        "short requirement names that would materially distinguish the available choices. "
                        "For a clear factual question or comparison of named products, sufficient is "
                        "true even when the catalog may not contain the answer; retrieval handles that "
                        "separately. Never ask for preferences or extra details before attempting to "
                        "answer a clear question. A request like 'which one should I select' is a "
                        "recommendation and is not "
                        "sufficient unless the user has explicitly stated an outcome/use case or other "
                        "decision criteria. For recommendations and troubleshooting, set sufficient false "
                        "when a missing detail could materially change the answer or make guidance unsafe. "
                        "Never ask again for information already present in the conversation. If "
                        "at least one customer requirement is known, the next question must target "
                        "one concrete differentiator found in the catalog, such as a documented "
                        "dimension, capacity, compatibility condition, environment, or service scope. "
                        "Do not ask vague catch-all questions about preferences, requirements, or "
                        "whether there is anything else. If "
                        "sufficient is false, clarification_question must ask only the smallest useful "
                        "question, in the customer's language, and may contain at most 3 short questions. "
                        "Otherwise clarification_question must be an empty string. "
                        "clarification_options must be empty unless the request itself is genuinely "
                        "unclear because it uses an unresolved reference such as 'that one' or contains "
                        "too little meaning to identify the subject. For those genuinely unclear requests "
                        "only, clarification_options may contain up to 3 short objects with "
                        "label and message. Each message must be a first-person customer answer to the "
                        "clarification question, never another question or an instruction. For example, "
                        "use label 'Personal use' with message 'I need it for personal use.' "
                        "Labels must be concrete answers to the question, not names of information fields. "
                        "Include options only when they are plausible interpretations "
                        "of the customer's own wording or concrete choices supported by the catalog; "
                        "never invent products, specifications, categories, or facts. Preserve names, "
                        "codes, quantities, and constraints exactly. Set no_more_information true only "
                        "when the latest customer "
                        "message explicitly says none of the choices match and provides no new useful "
                        "detail. Otherwise it must be false. Do not answer the customer and do not "
                        "include markdown. Use the catalog excerpts only to make clarification questions "
                        "and choices relevant to this company's actual offerings.\n\n"
                        f"Conversation:\n{conversation}\n"
                        f"Latest customer message:\n{question}\n\n"
                        f"Available catalog excerpts:\n{catalog_context or '(none available)'}\n\n"
                        + (
                            "A previous proposed clarification was rejected as repetitive: "
                            f"{avoid_question}\nAsk a materially different, concrete catalog-based "
                            "question. If no useful different question exists, set sufficient true."
                            if avoid_question else ""
                        )
                    ),
                }],
                temperature=0,
                max_tokens=350,
                response_format={"type": "json_object"},
            )
            parsed = json.loads(response.choices[0].message.content or "{}")
            intent = parsed.get("intent", "unclear")
            if intent not in {
                "factual", "recommendation", "comparison", "troubleshooting", "unclear"
            }:
                intent = "unclear"
            if self._is_recommendation_request(question):
                intent = "recommendation"
            sufficient = bool(parsed.get("sufficient", True))
            clarification = str(parsed.get("clarification_question") or "").strip()
            known_requirements = self._validated_known_requirements(
                parsed.get("known_requirements") or [], customer_evidence
            )
            missing_requirements = [
                " ".join(str(item).split())[:120]
                for item in (parsed.get("missing_requirements") or [])
                if str(item).strip()
            ][:5]
            if intent == "recommendation" and not known_requirements:
                sufficient = False
                if not clarification:
                    clarification = (
                        "What outcome do you need, and what requirements or constraints "
                        "must the recommendation meet?"
                    )
            options = []
            for option in parsed.get("clarification_options") or []:
                if not isinstance(option, dict):
                    continue
                label = str(option.get("label") or "").strip()
                message = str(option.get("message") or "").strip()
                if label and message:
                    options.append({"label": label[:120], "message": message[:500]})
                if len(options) == 3:
                    break
            allow_choice_buttons = (
                intent == "unclear"
                and self._is_fully_unclear_question(question)
            )
            options = (
                self._sanitize_clarification_options(clarification, options)
                if allow_choice_buttons
                else []
            )
            scenario_summary = str(parsed.get("scenario_summary") or "").strip()
            if intent == "recommendation":
                scenario_summary = "; ".join(
                    f"{item['requirement']}: {item['value']}"
                    for item in known_requirements
                )
            return {
                "intent": intent,
                "scenario_summary": scenario_summary,
                "known_requirements": known_requirements,
                "missing_requirements": missing_requirements,
                "sufficient": sufficient or not clarification,
                "clarification_question": clarification,
                "clarification_options": options,
                "allow_choice_buttons": allow_choice_buttons,
                "no_more_information": bool(parsed.get("no_more_information", False)),
            }
        except Exception:
            # Conversation analysis should improve answers, never prevent retrieval.
            return {
                "intent": "unclear",
                "scenario_summary": "",
                "known_requirements": [],
                "missing_requirements": [],
                "sufficient": True,
                "clarification_question": "",
                "clarification_options": [],
                "allow_choice_buttons": False,
                "no_more_information": False,
            }

    @staticmethod
    def _is_recommendation_request(question: str) -> bool:
        """Recognize selection language independently of any company's industry."""
        normalized = " ".join(question.casefold().split())
        return bool(re.search(
            r"\b(?:recommend|recommendation|suggest|best|choose|select|suitable|"
            r"right for me|fit for me|match for me|which one)\b",
            normalized,
        ))

    @staticmethod
    def _is_fully_unclear_question(question: str) -> bool:
        """Allow choice buttons only for short, explicitly unresolved requests."""
        normalized = " ".join(question.casefold().split()).strip(" .?!")
        if not normalized:
            return True

        unresolved_reference = re.search(
            r"\b(?:this|that|these|those)\s+(?:one|ones|product|model|option|item)s?\b|"
            r"\b(?:it|this|that)\s+one\b|"
            r"\bthe\s+(?:first|second|third|other|last)\s+one\b",
            normalized,
        )
        vague_request = re.fullmatch(
            r"(?:please\s+)?(?:help|help me|tell me more|more details|more information|"
            r"can you explain|explain this|what about this|what about that|what about it|"
            r"show me the options)",
            normalized,
        )
        return bool(unresolved_reference or vague_request)

    @staticmethod
    def _is_clear_factual_question(question: str) -> bool:
        """Keep answerable support requests out of the pre-retrieval questionnaire."""
        normalized = " ".join(question.casefold().split()).strip()
        if (
            not normalized
            or RAGEngine._is_recommendation_request(normalized)
            or RAGEngine._is_fully_unclear_question(normalized)
        ):
            return False

        if re.search(r"\b(?:compare|comparison|difference|different)\b|\bvs\.?\b|\bversus\b", normalized):
            return True

        # Troubleshooting, compatibility, safety, configuration, procedures,
        # and behaviour questions should retrieve evidence first. The answer
        # can provide documented causes/limits and then ask only for a truly
        # decision-critical missing measurement.
        if re.search(
            r"\b(?:why|what causes?|possible causes?|troubleshoot|error\s+\w+|"
            r"not working|not turning|not charging|won't|doesn't|isn't|"
            r"compatible|can i|could i|safe|fry|what happens|how do i|how to|"
            r"configure|configuration|setting|preset|wire|connect)\b",
            normalized,
        ):
            return True

        if extract_model_ids(question) and re.search(
            r"\b(?:what|which|where|when|does|do|can|could|is|are|will|"
            r"would|how\s+(?:much|many|long|wide|high|fast|deep|heavy))\b",
            normalized,
        ):
            return True

        return bool(re.match(
            r"^(?:"
            r"what\b|"
            r"what\s+(?:is|are|was|were|does|do|did|can|could|will|would|"
            r"size|voltage|current|power|capacity|rating|dimensions?|weight|"
            r"warranty|temperature|frequency|protection|ports?|connectors?|"
            r"fuse|error|code)\b|"
            r"(?:does|do|did|can|could|is|are|was|were|will|would|has|have)\b|"
            r"where\s+(?:is|are|does|do|can|could)\b|"
            r"when\s+(?:is|are|does|do|did|can|could|will)\b|"
            r"why\b|"
            r"how\s+(?:do|does|can|should)\b|"
            r"how\s+(?:much|many|long|wide|high|fast|deep|heavy)\b|"
            r"which\s+(?:port|ports|connector|connectors|input|output|fuse|"
            r"cable|setting|code|terminal|terminals)\b"
            r")",
            normalized,
        ))

    @staticmethod
    def _scope_history_to_current_topic(
        question: str,
        history: list[str],
    ) -> list[str]:
        """Keep only the latest topic needed to resolve an incomplete follow-up."""
        recent = history[-settings.conversation_history_messages:]
        if not recent:
            return []

        # A complete question must stand on its own. This prevents a previous
        # product (for example IC244090i) from contaminating a new named product
        # such as SureSine, even when the new product is not a code-like model ID.
        if not RAGEngine._question_requires_history(question):
            return []

        # An incomplete follow-up belongs to the most recent complete customer
        # topic, not to the most recent code-like model anywhere in the session.
        for index in range(len(recent) - 1, -1, -1):
            entry = recent[index].strip()
            if not entry.casefold().startswith("user:"):
                continue
            earlier_question = entry.split(":", 1)[1].strip()
            if RAGEngine._is_topic_anchor(earlier_question):
                return recent[index:]
        return recent

    @staticmethod
    def _question_requires_history(question: str) -> bool:
        """Return true only when the question omits the subject or uses a reference."""
        text = " ".join(str(question or "").split()).strip()
        normalized = text.casefold().strip(" .?!")
        if not normalized or extract_model_ids(text) or extract_product_names(text):
            return False

        if re.search(
            r"\b(?:it|its|itself|this|that|these|those|they|their|them)\b|"
            r"\b(?:this|that|the)\s+(?:one|ones|product|model|unit|item)\b|"
            r"\b(?:first|second|third|other|last)\s+one\b",
            normalized,
        ):
            return True

        # A short declarative reply commonly supplies a measurement or rules
        # out a cause requested in the previous turn ("I have a 12V battery",
        # "the panel is clean"). It is not a new standalone support topic.
        if "?" not in text and re.search(
            r"^(?:i\s+(?:have|use|am|measured|checked)|it\s+(?:is|has)|"
            r"the\s+(?:battery|panel|controller|inverter|charger|voltage|current)|"
            r"yes\b|no\b)",
            normalized,
        ):
            return True

        # CamelCase and mixed-case names such as SureSine are explicit product
        # subjects. Common electrical acronyms are deliberately excluded.
        generic_acronyms = {
            "AC", "DC", "PV", "USB", "LED", "BMS", "RMS", "MPPT",
            "VAC", "VDC", "Hz", "AWG",
        }
        product_tokens = re.findall(r"\b[A-Za-z][A-Za-z0-9-]{2,}\b", text)
        if any(
            token not in generic_acronyms
            and any(char.isupper() for char in token[1:])
            for token in product_tokens
        ):
            return False

        # These forms ask for an attribute but contain no named product subject.
        # Word order varies naturally ("supported system voltages" and "system
        # voltages are supported"), so do not rely only on a prefix match.
        if re.search(
            r"\bself[- ]?consumption\b|"
            r"\b(?:ambient|operating|storage|working)\s+temperature(?:\s+range)?\b|"
            r"\b(?:temperature|humidity|efficiency|waveform|dimensions?|weight|"
            r"warranty|frequency|voltage|current|power)\s+range\b|"
            r"^what\s+(?:(?:is|are)\s+)?(?:the\s+)?(?:purpose|safety\s+rule|"
            r"function|benefit)\b|"
            r"\bon\s+(?:[a-z0-9-]+\s+)?models?\b|"
            r"\b(?:system\s+)?(?:voltage|current|power|frequency|capacity|rating)s?\b.*"
            r"\b(?:available|supported|required|provided|included|allowed)\b|"
            r"\b(?:available|supported|required|provided|included|allowed)\b.*"
            r"\b(?:model|version|voltage|current|power|frequency|capacity|rating)s?\b|"
            r"\b(?:controller|inverter|charger|unit|product|model)(?:'s)?\s+"
            r"(?:self[- ]?consumption|voltage|current|power|rating|dimensions?|"
            r"weight|frequency|warranty|ports?|fuse|error)\b",
            normalized,
        ):
            return True

        return bool(re.match(
            r"^(?:what|which)\s+(?:(?:is|are|was|were)\s+)?(?:the\s+)?"
            r"(?:continuous|peak|rated|maximum|minimum|available|supported|"
            r"ambient|operating|storage|working|surge|temperature|efficiency|"
            r"waveform|ac|dc|input|output|power|voltage|current|rating|versions?|models?|"
            r"dimensions?|weight|frequency|warranty|ports?|fuse|error)\b|"
            r"^how\s+(?:much|many|long|wide|high|fast|heavy)\b|"
            r"^(?:does|do|can|could|is|are|will|would|has|have)\s+(?:the\s+)?"
            r"(?:product|model|unit|inverter|charger|controller)\b",
            normalized,
        ))

    @staticmethod
    def _is_topic_anchor(question: str) -> bool:
        raw = " ".join(str(question or "").split()).strip()
        normalized = raw.casefold().strip(" .?!")
        if not normalized or RAGEngine._question_requires_history(question):
            return False
        if normalized in {
            "hi", "hello", "hey", "thanks", "thank you", "ok", "okay",
            "im asking another one bro", "i'm asking another one bro",
        }:
            return False
        if extract_model_ids(raw) or "?" in raw:
            return True
        if re.match(
            r"^(?:what|which|where|when|why|how|who|does|do|can|could|is|"
            r"are|will|would|has|have|tell|explain|compare|recommend|find|help|"
            r"show|i\s+(?:need|want|am looking))\b",
            normalized,
        ):
            return True
        # Accept standalone CamelCase product names, but not short answers such
        # as "Solar installation" given during a recommendation interview.
        return any(
            any(char.isupper() for char in token[1:])
            for token in re.findall(r"\b[A-Za-z][A-Za-z0-9-]{2,}\b", raw)
        )

    @staticmethod
    def _validated_known_requirements(items: list, customer_evidence: str) -> list[dict]:
        """Keep only requirements backed by a verbatim customer statement."""
        normalized_evidence = re.sub(r"\W+", " ", customer_evidence.casefold()).strip()
        validated = []
        seen = set()
        for item in items:
            if not isinstance(item, dict):
                continue
            requirement = " ".join(str(item.get("requirement") or "").split()).strip()
            value = " ".join(str(item.get("value") or "").split()).strip()
            evidence = " ".join(str(item.get("evidence") or "").split()).strip()
            normalized_quote = re.sub(r"\W+", " ", evidence.casefold()).strip()
            key = (requirement.casefold(), value.casefold())
            if (
                not requirement
                or not value
                or len(normalized_quote) < 3
                or normalized_quote not in normalized_evidence
                or key in seen
            ):
                continue
            seen.add(key)
            validated.append({
                "requirement": requirement[:120],
                "value": value[:300],
                "evidence": evidence[:300],
            })
        return validated[:12]

    @staticmethod
    def _catalog_context(candidates: list[dict], max_characters: int = 6000) -> str:
        """Build bounded catalog evidence used only to ask relevant questions."""
        blocks = []
        used = 0
        for candidate in candidates:
            document_name = " ".join(
                str(candidate.get("document_name") or "Catalog document").split()
            )
            content = " ".join(str(candidate.get("content") or "").split())
            if not content:
                continue
            block = f"[{document_name}] {content[:900]}"
            remaining = max_characters - used
            if remaining <= 0:
                break
            blocks.append(block[:remaining])
            used += len(block)
        return "\n\n".join(blocks)

    @staticmethod
    def _fallback_clarification(missing_requirements: list[str]) -> str:
        """Request unresolved criteria without using company-specific vocabulary."""
        details = [
            " ".join(str(item).split()).strip(" .?!")
            for item in missing_requirements
            if str(item).strip()
        ][:3]
        if details:
            if len(details) == 1:
                detail_text = details[0]
            else:
                detail_text = ", ".join(details[:-1]) + f", and {details[-1]}"
            return (
                "Please provide the following detail so I can distinguish the best match: "
                f"{detail_text}."
            )
        return (
            "Please describe the outcome you need and the most important constraint the "
            "recommended choice must satisfy."
        )

    @staticmethod
    def _looks_like_question(value: str) -> bool:
        text = re.sub(r"^(?:assistant|user):\s*", "", value.strip(), flags=re.I)
        if not text:
            return False
        if "?" in text:
            return True
        return bool(re.match(
            r"^(?:what|which|who|where|when|why|how|do|does|did|is|are|was|were|"
            r"can|could|would|will|should|have|has|tell|choose|select|provide|specify|describe|please)\b",
            text,
            flags=re.I,
        ))

    @classmethod
    def _sanitize_clarification_options(
        cls, clarification: str, options: list[dict]
    ) -> list[dict]:
        """Ensure a suggestion click sends a customer answer, never another prompt."""
        cleaned = []
        seen = set()
        for option in options:
            label = " ".join(str(option.get("label") or "").split()).strip(" .?!")
            message = " ".join(str(option.get("message") or "").split()).strip()
            if not label or label.casefold() in seen:
                continue
            seen.add(label.casefold())

            if (
                not message
                or cls._looks_like_question(message)
                or message.casefold().rstrip(" .?!")
                == clarification.casefold().rstrip(" .?!")
            ):
                continue
            elif not re.match(r"^(?:i|i'm|i’d|i'll|my|we|we're|our)\b", message, re.I):
                message = f"My answer is: {message.rstrip(' .')}."

            cleaned.append({"label": label[:120], "message": message[:500]})
            if len(cleaned) == 3:
                break
        return cleaned

    @classmethod
    def _clarification_round_count(cls, history: list[str]) -> int:
        """Count the current uninterrupted run of assistant clarification questions."""
        rounds = 0
        for entry in reversed(history):
            if not entry.strip().lower().startswith("assistant:"):
                continue
            if cls._looks_like_question(entry):
                rounds += 1
            else:
                break
        return rounds

    @classmethod
    def _is_repeated_clarification(cls, question: str, history: list[str]) -> bool:
        proposed = re.sub(r"\W+", " ", question.casefold()).strip()
        if not proposed:
            return False
        proposed_tokens = set(proposed.split())
        filler_words = {
            "a", "an", "are", "be", "do", "does", "for", "is", "it", "of",
            "referring", "that", "the", "this", "to", "what", "which", "you", "your",
        }
        proposed_meaning = proposed_tokens - filler_words
        for entry in history:
            if not entry.strip().lower().startswith("assistant:"):
                continue
            previous = re.sub(
                r"\W+",
                " ",
                re.sub(r"^assistant:\s*", "", entry, flags=re.I).casefold(),
            ).strip()
            if not previous:
                continue
            similarity = SequenceMatcher(None, proposed, previous).ratio()
            previous_tokens = set(previous.split())
            union = proposed_tokens | previous_tokens
            overlap = len(proposed_tokens & previous_tokens) / len(union) if union else 0
            previous_meaning = previous_tokens - filler_words
            smaller_meaning = min(len(proposed_meaning), len(previous_meaning))
            meaning_containment = (
                len(proposed_meaning & previous_meaning) / smaller_meaning
                if smaller_meaning else 0
            )
            if similarity >= 0.78 or overlap >= 0.72 or meaning_containment >= 0.8:
                return True
        return False
    
    def ingest(
        self,
        company_id: str,
        document_id: str,
        file_path: str,
        document_name: str,
        document_version: str = "1",
        effective_date: str = "",
        is_active: bool = True,
    ) -> int:
        pages = extract_pages_from_pdf(file_path)
        chunks = chunk_pages(pages)
        return self.store.add_document_chunks(
            company_id=company_id,
            document_id=document_id,
            document_name=document_name or file_path.split("/")[-1],
            chunks=chunks,
            document_version=document_version,
            effective_date=effective_date,
            is_active=is_active,
        )

    def delete_document(self, company_id: str, document_id: str) -> None:
        self.store.delete_document(company_id, document_id)

    def query(
        self,
        company_id: str,
        question: str,
        top_k: int | None = None,
        history: list[str] | None = None,
        preferred_document_ids: list[str] | None = None,
        preferred_product_names: list[str] | None = None,
        preferred_model_ids: list[str] | None = None,
    ) -> QueryResponse:
        query_started = perf_counter()
        timings: dict[str, int] = {}
        retrieval_stats: dict[str, int | bool | str] = {}

        def mark(name: str, started: float) -> None:
            timings[name] = int((perf_counter() - started) * 1000)

        k = top_k or settings.top_k
        answer_modes = self._answer_modes(question)
        retrieval_stats["top_k"] = k
        retrieval_stats["answer_modes"] = ", ".join(answer_modes)
        retrieval_stats["reranking_enabled"] = bool(settings.enable_reranking or self.cross_encoder)
        retrieval_stats["answer_verification_enabled"] = bool(settings.enable_answer_verification)
        retrieval_stats["numeric_verification_enabled"] = bool(settings.enable_numeric_verification)
        scoped_history = self._scope_history_to_current_topic(question, history or [])
        retrieval_stats["history_messages_received"] = len(history or [])
        retrieval_stats["history_messages_used"] = len(scoped_history)

        started = perf_counter()
        if not self.store.company_has_documents(company_id):
            mark("document_check", started)
            timings["total"] = int((perf_counter() - query_started) * 1000)
            return QueryResponse(
                answer="No documents have been uploaded for this company yet. Please upload support documents first.",
                sources=[],
                diagnostics=QueryDiagnostics(
                    timings_ms=timings,
                    retrieval=retrieval_stats,
                ),
            )
        mark("document_check", started)

        if question.strip().casefold() == (
            "none of these choices match, and i do not have more information."
        ):
            timings["total"] = int((perf_counter() - query_started) * 1000)
            return QueryResponse(
                answer=(
                    "I don't have enough information in your question to identify the "
                    "correct product or guidance."
                ),
                sources=[],
                diagnostics=QueryDiagnostics(
                    timings_ms=timings,
                    retrieval=retrieval_stats,
                ),
            )

        started = perf_counter()
        base_standalone_question = self._standalone_question(question, scoped_history)
        mark("standalone_question", started)
        explicit_model_ids = extract_model_ids(question)
        preferred_models = {
            normalized
            for item in (preferred_model_ids or [])
            if (normalized := normalize_model_id(item))
        }
        required_model_ids = (
            explicit_model_ids
            or extract_model_ids(base_standalone_question)
            or (preferred_models if scoped_history else set())
        )
        explicit_product_names = extract_product_names(question)
        preferred_products = {
            normalized
            for item in (preferred_product_names or [])
            if (normalized := normalize_product_name(item))
        }
        required_product_names = (
            explicit_product_names
            or extract_product_names(base_standalone_question)
            or (preferred_products if scoped_history else set())
        )
        if not required_product_names and scoped_history:
            required_product_names = extract_product_names("\n".join(scoped_history))
        allowed_document_ids = (
            {
                str(document_id).strip()
                for document_id in (preferred_document_ids or [])
                if str(document_id).strip()
            }
            if scoped_history and not explicit_model_ids and not explicit_product_names
            else set()
        )
        retrieval_stats["model_filter_applied"] = bool(required_model_ids)
        retrieval_stats["explicit_model_ids"] = ", ".join(
            sorted(explicit_model_ids)
        )
        retrieval_stats["required_model_ids"] = ", ".join(
            sorted(required_model_ids)
        )
        retrieval_stats["product_filter_applied"] = bool(required_product_names)
        retrieval_stats["explicit_product_names"] = ", ".join(
            sorted(explicit_product_names)
        )
        retrieval_stats["required_product_names"] = ", ".join(
            sorted(required_product_names)
        )
        retrieval_stats["document_scope_applied"] = bool(allowed_document_ids)
        retrieval_stats["allowed_document_count"] = len(allowed_document_ids)

        started = perf_counter()
        preliminary_candidates = self.store.hybrid_query(
            company_id,
            base_standalone_question,
            min(max(k, 8), 12),
            required_model_ids=required_model_ids,
            required_product_names=required_product_names,
            allowed_document_ids=allowed_document_ids,
        )
        mark("catalog_retrieval", started)

        started = perf_counter()
        catalog_context = self._catalog_context(preliminary_candidates)
        if self._is_clear_factual_question(question):
            request_analysis = {
                "intent": answer_modes[0],
                "scenario_summary": "",
                "known_requirements": [],
                "missing_requirements": [],
                "sufficient": True,
                "clarification_question": "",
                "clarification_options": [],
                "allow_choice_buttons": False,
                "no_more_information": False,
            }
        else:
            request_analysis = self._analyze_request(
                question,
                scoped_history,
                catalog_context,
            )
        mark("request_analysis", started)
        retrieval_stats["intent"] = request_analysis["intent"]
        retrieval_stats["known_requirement_count"] = len(
            request_analysis["known_requirements"]
        )
        retrieval_stats["missing_requirements"] = ", ".join(
            request_analysis["missing_requirements"]
        )[:500]
        clarification_rounds = self._clarification_round_count(scoped_history)
        repeated_clarification = self._is_repeated_clarification(
            request_analysis["clarification_question"], scoped_history
        )
        if (
            repeated_clarification
            and clarification_rounds < settings.max_clarification_rounds
        ):
            retry_analysis = self._analyze_request(
                question,
                scoped_history,
                catalog_context,
                avoid_question=request_analysis["clarification_question"],
            )
            retry_repeated = self._is_repeated_clarification(
                retry_analysis["clarification_question"], scoped_history
            )
            if retry_repeated:
                retry_analysis["sufficient"] = False
                retry_analysis["clarification_question"] = self._fallback_clarification(
                    retry_analysis["missing_requirements"]
                    or request_analysis["missing_requirements"]
                )
                retry_analysis["clarification_options"] = []
            request_analysis = retry_analysis
            repeated_clarification = False
            retrieval_stats["intent"] = request_analysis["intent"]
            retrieval_stats["known_requirement_count"] = len(
                request_analysis["known_requirements"]
            )
            retrieval_stats["missing_requirements"] = ", ".join(
                request_analysis["missing_requirements"]
            )[:500]
        clarification_exhausted = (
            clarification_rounds >= settings.max_clarification_rounds
            or repeated_clarification
        )
        retrieval_stats["clarification_rounds"] = clarification_rounds
        retrieval_stats["clarification_exhausted"] = clarification_exhausted
        if request_analysis["no_more_information"]:
            timings["total"] = int((perf_counter() - query_started) * 1000)
            return QueryResponse(
                answer=(
                    "I don't have enough information in your question to identify the "
                    "correct product or guidance."
                ),
                sources=[],
                diagnostics=QueryDiagnostics(
                    timings_ms=timings,
                    retrieval=retrieval_stats,
                ),
            )
        if not request_analysis["sufficient"] and not clarification_exhausted:
            suggestions = [
                ClarificationSuggestion(label=option["label"], message=option["message"])
                for option in request_analysis["clarification_options"]
            ]
            timings["total"] = int((perf_counter() - query_started) * 1000)
            return QueryResponse(
                answer=request_analysis["clarification_question"],
                sources=[],
                suggestions=suggestions,
                diagnostics=QueryDiagnostics(
                    timings_ms=timings,
                    retrieval=retrieval_stats,
                ),
            )

        started = perf_counter()
        standalone_question = base_standalone_question
        if request_analysis["scenario_summary"]:
            standalone_question = (
                f"{standalone_question}\nCustomer scenario and constraints: "
                f"{request_analysis['scenario_summary']}"
            )
        if clarification_exhausted:
            standalone_question = (
                f"{standalone_question}\nThe clarification limit has been reached. "
                "Do not ask another question. Use the known requirements and give the "
                "best-supported result, stating assumptions or missing constraints."
            )
        mark("scenario_question", started)

        started = perf_counter()
        queries = []
        for variant in self._multilingual_variants(standalone_question):
            queries.extend(self._expand_query(variant))
        queries.extend(self._mode_search_queries(standalone_question, answer_modes))
        if self._is_model_list_question(standalone_question):
            queries.append(
                f"{standalone_question} models included in this manual exact model identifiers"
            )
        queries = list(dict.fromkeys(queries))
        mark("query_expansion", started)
        retrieval_stats["query_count"] = len(queries)

        candidate_k = max(k, settings.retrieval_candidates)
        per_query_k = max(6, candidate_k // len(queries))
        seen = {}
        for chunk in preliminary_candidates:
            key = (chunk["document_id"], chunk.get("page_number"), chunk["content"][:80])
            seen[key] = chunk
        started = perf_counter()
        for q in queries:
            for chunk in self.store.hybrid_query(
                company_id,
                q,
                per_query_k,
                required_model_ids=required_model_ids,
                required_product_names=required_product_names,
                allowed_document_ids=allowed_document_ids,
            ):
                key = (chunk["document_id"], chunk.get("page_number"), chunk["content"][:80])
                if key not in seen or chunk["rank_score"] > seen[key]["rank_score"]:
                    seen[key] = chunk
        mark("retrieval", started)
        retrieval_stats["candidate_count"] = len(seen)

        if self._is_model_list_question(standalone_question):
            for chunk in seen.values():
                content = chunk.get("content", "")
                explicit_ids = extract_model_ids(content)
                if re.search(r"\bmodels?\s+(?:included|available|offered)\b", content, re.I):
                    chunk["rank_score"] += 0.08
                elif len(explicit_ids) >= 3:
                    chunk["rank_score"] += 0.04

        self._apply_answer_mode_boosts(list(seen.values()), answer_modes)

        candidates = sorted(
            seen.values(), key=lambda c: c["rank_score"], reverse=True
        )[:candidate_k]
        if required_model_ids:
            candidates = [
                chunk for chunk in candidates
                if (
                    set(chunk.get("model_ids", [])) & required_model_ids
                    or (
                        chunk.get("model_scope") == "shared"
                        and set(chunk.get("document_model_ids", []))
                        & required_model_ids
                    )
                )
            ]
        if not self._is_visual_evidence_question(standalone_question):
            reliable_candidates = [
                chunk for chunk in candidates
                if chunk.get("evidence_type", "text") != "vision"
            ]
            if reliable_candidates:
                candidates = reliable_candidates
        started = perf_counter()
        retrieved = self._rerank(standalone_question, candidates, k)
        mark("rerank", started)
        retrieved = [
            chunk for chunk in retrieved
            if chunk["score"] >= settings.minimum_relevance_score
        ]
        retrieval_stats["retrieved_count"] = len(retrieved)
        retrieval_stats["retrieved_locations"] = "; ".join(
            f"{chunk.get('document_name', '')}:p{chunk.get('page_number', '?')}"
            for chunk in retrieved
        )[:1000]
        started = perf_counter()
        retrieved = self.store.expand_neighbors(
            company_id,
            retrieved,
            settings.neighbor_chunks,
            required_model_ids=required_model_ids,
            allowed_document_ids=allowed_document_ids,
        )
        mark("neighbor_expansion", started)
        

        if not retrieved and clarification_exhausted:
            timings["total"] = int((perf_counter() - query_started) * 1000)
            return QueryResponse(
                answer=(
                    "I don't have enough confirmed information to recommend one confidently. "
                    "If you can share the product model, system specification, or required "
                    "compatibility later, I'll be able to narrow it down."
                ),
                sources=[],
                diagnostics=QueryDiagnostics(
                    timings_ms=timings,
                    retrieval=retrieval_stats,
                ),
            )
        if not retrieved:
            timings["total"] = int((perf_counter() - query_started) * 1000)
            return QueryResponse(
                answer=(
                    "I couldn't find enough reliable information to answer that confidently. "
                    "Try rephrasing the question or checking the product name and model."
                ),
                sources=[],
                suggestions=[],
                diagnostics=QueryDiagnostics(
                    timings_ms=timings,
                    retrieval=retrieval_stats,
                ),
            )

        context_blocks = []
        for i, chunk in enumerate(retrieved, 1):
            page = (
                f", page {chunk['page_number']}"
                if chunk.get("page_number") else ""
            )
            section = (
                f", section {chunk['section_heading']}"
                if chunk.get("section_heading") else ""
            )
            context_blocks.append(
                f"[Source {i} - {chunk['document_name']}{page}{section}]\n"
                f"{chunk.get('context_content', chunk['content'])}"
            )
        context = "\n\n---\n\n".join(context_blocks)

        recent_history = scoped_history[-settings.conversation_history_messages:]
        conversation = "\n".join(recent_history) or "(no earlier messages)"
        started = perf_counter()
        response = self.openai.chat.completions.create(
            model=settings.openai_chat_model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": (
                        f"Conversation so far:\n{conversation}\n"
                        f"user: {question}\n\n"
                        f"Knowledge-base context:\n{context}\n\n"
                        f"Standalone search question: {standalone_question}\n\n"
                        f"Required answer modes: {', '.join(answer_modes)}. "
                        "Address every distinct sub-question in the user's message.\n\n"
                        + (
                            "Response requirement: the customer has completed the maximum "
                            "clarification rounds. Do not ask another question. Give the best "
                            "supported recommendation and explicitly state assumptions or gaps."
                            if clarification_exhausted else ""
                        )
                    ),
                },
            ],
            temperature=0.2,
        )
        mark("answer_generation", started)

        answer = response.choices[0].message.content or ""
        started = perf_counter()
        answer = self._verify_answer(
            standalone_question,
            context,
            answer,
            allow_clarification=not clarification_exhausted,
        )
        answer = self._remove_verifier_commentary(answer)
        unsupported_model_ids = self._unsupported_model_ids(
            answer,
            retrieved,
            allowed_model_ids=required_model_ids,
        )
        retrieval_stats["model_id_repair_attempted"] = False
        retrieval_stats["initial_unsupported_model_id_count"] = len(
            unsupported_model_ids
        )
        if unsupported_model_ids:
            retrieval_stats["model_id_repair_attempted"] = True
            answer = self._repair_model_id_answer(
                standalone_question,
                context,
                answer,
                unsupported_model_ids,
            )
            answer = self._remove_verifier_commentary(answer)
            unsupported_model_ids = self._unsupported_model_ids(
                answer,
                retrieved,
                allowed_model_ids=required_model_ids,
            )
        retrieval_stats["unsupported_model_id_count"] = len(unsupported_model_ids)
        if unsupported_model_ids:
            timings["total"] = int((perf_counter() - query_started) * 1000)
            return QueryResponse(
                answer=(
                    "I found the relevant product family, but I couldn't confirm the "
                    "exact model identifiers reliably. Please check the model list in "
                    "the product manual."
                ),
                sources=[],
                suggestions=[],
                diagnostics=QueryDiagnostics(
                    timings_ms=timings,
                    retrieval=retrieval_stats,
                ),
            )
        unsupported_numeric_claims = (
            self._unsupported_numeric_claims(answer, retrieved)
            if settings.enable_numeric_verification
            else []
        )
        retrieval_stats["numeric_repair_attempted"] = False
        retrieval_stats["initial_unsupported_numeric_claim_count"] = len(
            unsupported_numeric_claims
        )
        if unsupported_numeric_claims:
            retrieval_stats["numeric_repair_attempted"] = True
            answer = self._repair_numeric_answer(
                standalone_question,
                context,
                answer,
                unsupported_numeric_claims,
            )
            answer = self._remove_verifier_commentary(answer)
            unsupported_numeric_claims = self._unsupported_numeric_claims(
                answer,
                retrieved,
            )
        retrieval_stats["unsupported_numeric_claim_count"] = len(
            unsupported_numeric_claims
        )
        if unsupported_numeric_claims:
            answer = self._remove_unsupported_numeric_sentences(
                answer, unsupported_numeric_claims
            )
            retrieval_stats["numeric_claims_removed"] = len(unsupported_numeric_claims)
            unsupported_numeric_claims = self._unsupported_numeric_claims(answer, retrieved)
            retrieval_stats["unsupported_numeric_claim_count"] = len(
                unsupported_numeric_claims
            )
            if not answer.strip() or unsupported_numeric_claims:
                answer = (
                    "I found related guidance, but the documents don't confirm the exact "
                    "numeric value needed for a final result. Please share the exact product "
                    "model and the missing specification."
                )
        if self._is_unsupported_answer(answer):
            if clarification_exhausted:
                answer = (
                    "I don't have enough confirmed information to make a confident recommendation "
                    "yet. When you have the product model or compatibility details, share them "
                    "with me and I'll help you narrow it down."
                )
            else:
                timings["total"] = int((perf_counter() - query_started) * 1000)
                return QueryResponse(
                    answer=(
                        "I couldn't find enough reliable information to answer that confidently. "
                        "Try rephrasing the question or checking the product name and model."
                    ),
                    sources=[],
                    suggestions=[],
                    diagnostics=QueryDiagnostics(
                        timings_ms=timings,
                        retrieval=retrieval_stats,
                    ),
                )
        cited_indices = {
            int(index)
            for index in re.findall(r"\[Source\s+(\d+)\]", answer, flags=re.I)
            if 1 <= int(index) <= len(retrieved)
        }
        cited_retrieved = [
            chunk for index, chunk in enumerate(retrieved, 1)
            if index in cited_indices
        ]
        cited_retrieved = self._deduplicate_source_documents(cited_retrieved)
        sources = [
            SourceChunk(
                document_id=c["document_id"],
                document_name=c["document_name"],
                content=c["content"][:300] + ("..." if len(c["content"]) > 300 else ""),
                score=c["score"],
                page_number=c.get("page_number"),
                section_heading=c.get("section_heading", ""),
            )
            for c in cited_retrieved
        ]

        timings["total"] = int((perf_counter() - query_started) * 1000)
        return QueryResponse(
            answer=answer,
            sources=sources,
            diagnostics=QueryDiagnostics(
                timings_ms=timings,
                retrieval=retrieval_stats,
            ),
        )

    @staticmethod
    def _is_visual_evidence_question(question: str) -> bool:
        normalized = " ".join(str(question or "").casefold().split())
        return bool(re.search(
            r"\b(?:diagram|drawing|illustration|image|picture|mounting|mount|"
            r"hole|holes|flange|tab|layout|position|located|location|"
            r"wiring|connector|terminal)\b",
            normalized,
        ))

    @staticmethod
    def _is_model_list_question(question: str) -> bool:
        normalized = " ".join(str(question or "").casefold().split())
        return bool(
            re.search(r"\bmodels?\b", normalized)
            and re.search(
                r"\b(?:available|included|offered|list|which|what)\b",
                normalized,
            )
        )

    @staticmethod
    def _deduplicate_source_documents(chunks: list[dict]) -> list[dict]:
        """Show each cited PDF once while keeping its highest-ranked citation."""
        unique = []
        seen = set()
        for chunk in chunks:
            key = chunk.get("document_id") or chunk.get("document_name")
            if not key or key in seen:
                continue
            seen.add(key)
            unique.append(chunk)
        return unique

    @staticmethod
    def _is_unsupported_answer(answer: str) -> bool:
        normalized = " ".join(answer.lower().split())
        unsupported_phrases = (
            "i couldn't find relevant information",
            "i could not find relevant information",
            "not available in the documents",
        )
        # A useful partial answer may accurately say that one final input is
        # missing. Treat it as unsupported only when it contains no citation.
        if re.search(r"\[source\s+\d+\]", answer, re.I):
            return False
        return bool(re.search(r"\bi (?:don't|do not) have\b", normalized)) or any(
            phrase in normalized for phrase in unsupported_phrases
        )

    @classmethod
    def _remove_unsupported_numeric_sentences(
        cls,
        answer: str,
        unsupported_claims: list[tuple[str, str, str]],
    ) -> str:
        """Drop only residual unsupported claims, preserving the useful answer."""
        unsupported = set(unsupported_claims)
        kept: list[str] = []
        for line in answer.splitlines():
            if not line.strip():
                kept.append(line)
                continue
            sentences = re.split(r"(?<=[.!?])\s+", line)
            safe_sentences = [
                sentence for sentence in sentences
                if not (cls._numeric_claims(sentence) & unsupported)
            ]
            if safe_sentences:
                kept.append(" ".join(safe_sentences))
        cleaned = "\n".join(kept)
        cleaned = re.sub(
            r"(?im)^\s*(?:[-*]|\d+[.)])?\s*(?:\[Source\s+\d+\])?\s*$",
            "",
            cleaned,
        )
        cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
        return cleaned.strip()

    @staticmethod
    def _numeric_claims(text: str) -> set[tuple[str, str, str]]:
        """Extract exact technical values while ignoring citation/model numbers."""
        cleaned = re.sub(r"\[Source\s+\d+\]", "", text, flags=re.I)
        # A suffix such as 12V inside SS-6-12V identifies the model; it is not a
        # claim that the system voltage is 12 V. Remove hyphenated model tokens
        # before parsing technical numeric values.
        cleaned = re.sub(
            r"(?<![A-Za-z0-9])[A-Za-z][A-Za-z0-9]*"
            r"(?:-[A-Za-z0-9]+){2,}(?![A-Za-z0-9])",
            " ",
            cleaned,
        )
        number_words = {
            "one": "1", "two": "2", "three": "3", "four": "4", "five": "5",
            "six": "6", "seven": "7", "eight": "8", "nine": "9", "ten": "10",
        }
        cleaned = re.sub(
            r"\b(one|two|three|four|five|six|seven|eight|nine|ten)"
            r"(?=\s*-?\s*(?:years?|days?|hours?|hrs?)\b)",
            lambda match: number_words[match.group(1).casefold()],
            cleaned,
            flags=re.I,
        )
        unit_aliases = {
            "amp": "a", "amps": "a", "ampere": "a", "amperes": "a",
            "volt": "v", "volts": "v", "watt": "w", "watts": "w",
            "kilowatt": "kw", "kilowatts": "kw",
            "percent": "%", "percentage": "%", "hours": "hour",
            "hrs": "hour", "hr": "hour", "years": "year", "days": "day",
        }
        claims: set[tuple[str, str, str]] = set()
        pattern = re.compile(
            r"(?<![A-Za-z0-9])(?P<comparator>>=|<=|>|<|≥|≤|at\s+least|"
            r"more\s+than|above|under|less\s+than)?\s*"
            r"(?P<number>-?\d+(?:,\d{3})*(?:\.\d+)?)\s*-?\s*"
            r"(?P<unit>°?\s*(?:C|F)|VAC|VDC|V|volts?|kW|kilowatts?|MW|W|watts?|mA|A|amps?|amperes?|"
            r"mAh|Ah|kHz|Hz|mm|cm|kg|%|percent(?:age)?|hours?|hrs?|years?|days?)\b",
            flags=re.I,
        )

        def add_claim(number: str, unit: str, comparator: str = "") -> None:
            try:
                normalized_number = format(Decimal(number.replace(",", "")), "f")
                if "." in normalized_number:
                    normalized_number = normalized_number.rstrip("0").rstrip(".")
            except InvalidOperation:
                return
            normalized_unit = re.sub(r"[°\s]", "", unit).casefold()
            normalized_unit = unit_aliases.get(normalized_unit, normalized_unit)
            normalized_comparator = {
                "≥": ">=", "≤": "<=", "at least": ">=",
                "more than": ">", "above": ">", "under": "<",
                "less than": "<",
            }.get(comparator.casefold(), comparator)
            claims.add((normalized_comparator, normalized_number, normalized_unit))

        for match in pattern.finditer(cleaned):
            add_claim(
                match.group("number"),
                match.group("unit"),
                match.group("comparator") or "",
            )

        dimensions = re.compile(
            r"(?<![A-Za-z0-9])(-?\d+(?:\.\d+)?)\s*[x×]\s*"
            r"(-?\d+(?:\.\d+)?)(?:\s*[x×]\s*(-?\d+(?:\.\d+)?))?\s*"
            r"(mm|cm)\b",
            flags=re.I,
        )
        for match in dimensions.finditer(cleaned):
            for number in match.groups()[:3]:
                if number is not None:
                    add_claim(number, match.group(4))

        ranges = re.compile(
            r"(?<![A-Za-z0-9])(-?\d+(?:\.\d+)?)\s*(?:/|to|[-–])\s*"
            r"(-?\d+(?:\.\d+)?)\s*"
            r"(VAC|VDC|V|volts?|kW|kilowatts?|W|watts?|mA|A|amps?|amperes?|"
            r"mAh|Ah|kHz|Hz|mm|cm|kg|%|percent(?:age)?|hours?|hrs?|years?|days?)\b",
            flags=re.I,
        )
        for match in ranges.finditer(cleaned):
            add_claim(match.group(1), match.group(3))
            add_claim(match.group(2), match.group(3))
        return claims

    @classmethod
    def _unsupported_numeric_claims(
        cls,
        answer: str,
        retrieved: list[dict],
    ) -> list[tuple[str, str, str]]:
        claims = cls._numeric_claims(answer)
        if not claims:
            return []
        cited = {
            int(value)
            for value in re.findall(r"\[Source\s+(\d+)\]", answer, flags=re.I)
            if 1 <= int(value) <= len(retrieved)
        }
        if not cited:
            return sorted(claims)
        cited_document_ids = {
            retrieved[index - 1].get("document_id", "")
            for index in cited
        }
        # A specification table is commonly split into several chunks. An
        # answer can correctly cite one row while another value from the same
        # retrieved page lands in a neighbouring chunk. Verify against all
        # retrieved evidence from the cited document(s), including expanded
        # neighbour context, while still excluding unrelated documents.
        supporting_chunks = [
            chunk for chunk in retrieved
            if chunk.get("document_id", "") in cited_document_ids
        ]
        supporting_text = "\n".join(
            chunk.get(
                "context_content",
                chunk.get("content", ""),
            )
            for chunk in supporting_chunks
        )
        source_claims = cls._numeric_claims(supporting_text)
        return sorted(claims - source_claims)

    @staticmethod
    def _unsupported_model_ids(
        answer: str,
        retrieved: list[dict],
        allowed_model_ids: set[str] | None = None,
    ) -> list[str]:
        model_ids = extract_model_ids(answer)
        if not model_ids:
            return []
        cited = {
            int(value)
            for value in re.findall(r"\[Source\s+(\d+)\]", answer, flags=re.I)
            if 1 <= int(value) <= len(retrieved)
        }
        if not cited:
            return sorted(model_ids)
        supporting_text = "\n".join(
            retrieved[index - 1].get(
                "context_content",
                retrieved[index - 1].get("content", ""),
            )
            for index in sorted(cited)
        )
        return sorted(
            model_ids
            - extract_model_ids(supporting_text)
            - (allowed_model_ids or set())
        )

    def _repair_model_id_answer(
        self,
        question: str,
        context: str,
        answer: str,
        unsupported_model_ids: list[str],
    ) -> str:
        """Remove or correct invented model identifiers using exact source text."""
        try:
            response = self.openai.chat.completions.create(
                model=settings.openai_chat_model,
                messages=[{
                    "role": "user",
                    "content": (
                        "Repair this answer using only the supplied source context. The "
                        "following normalized model identifiers are not supported by their "
                        f"citations: {', '.join(unsupported_model_ids)}. Remove invented IDs "
                        "and, when the context contains an explicit model list, copy every "
                        "relevant model identifier exactly as printed, preserving hyphens and "
                        "suffixes. Never turn voltage categories into model names. Cite the "
                        "source that contains the list and return only the repaired answer.\n\n"
                        f"Question:\n{question}\n\nSource context:\n{context}\n\n"
                        f"Answer to repair:\n{answer}"
                    ),
                }],
                temperature=0,
            )
            repaired = (response.choices[0].message.content or "").strip()
            return repaired or answer
        except Exception:
            return answer

    def _repair_numeric_answer(
        self,
        question: str,
        context: str,
        answer: str,
        unsupported_claims: list[tuple[str, str, str]],
    ) -> str:
        """Give the model one bounded chance to correct values/citations from evidence."""
        rendered_claims = ", ".join(
            f"{comparator}{number} {unit}".strip()
            for comparator, number, unit in unsupported_claims
        )
        try:
            response = self.openai.chat.completions.create(
                model=settings.openai_chat_model,
                messages=[{
                    "role": "user",
                    "content": (
                        "Repair this customer-support answer using only the supplied source "
                        "context. Some numeric claims are missing exact support or a usable "
                        f"citation: {rendered_claims}. Correct them to the exact source values "
                        "or remove them. Put a [Source N] citation in every paragraph or bullet "
                        "that contains a factual specification. Keep supported useful details, "
                        "answer the question directly, and return only the repaired answer. "
                        "Never mention this repair process.\n\n"
                        f"Question:\n{question}\n\n"
                        f"Source context:\n{context}\n\n"
                        f"Answer to repair:\n{answer}"
                    ),
                }],
                temperature=0,
            )
            repaired = (response.choices[0].message.content or "").strip()
            return repaired or answer
        except Exception:
            return answer

    @staticmethod
    def _remove_verifier_commentary(answer: str) -> str:
        """Remove accidental internal editing notes from a customer-facing answer."""
        cleaned = re.sub(
            r"(?im)(?:^|(?<=[.!?]))\s*[^.!?\n]*(?:"
            r"unsupported in (?:the )?(?:provided|supplied) context|"
            r"should be removed|should be omitted"
            r")[^.!?\n]*[.!?]?",
            " ",
            answer,
        )
        cleaned = re.sub(r"(?im)^.*(?:draft answer|verified answer).*$", "", cleaned)
        cleaned = (
            cleaned.replace("�C", "°C")
            .replace("�F", "°F")
            .replace("˚C", "°C")
            .replace("˚F", "°F")
        )
        cleaned = re.sub(r"[ \t]+\n", "\n", cleaned)
        cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
        return cleaned.strip()

    def _standalone_question(self, question: str, history: list[str]) -> str:
        if not history:
            return question
        recent = history[-settings.conversation_history_messages:]
        try:
            response = self.openai.chat.completions.create(
                model=settings.openai_chat_model,
                messages=[{
                    "role": "user",
                    "content": (
                        "Rewrite the latest support question as one standalone question "
                        "using the conversation only to resolve references such as it, "
                        "that, or they. Preserve the user's meaning and language. Return "
                        "only the rewritten question.\n\nConversation:\n"
                        + "\n".join(recent)
                        + f"\nuser: {question}"
                    ),
                }],
                temperature=0,
                max_tokens=150,
            )
            rewritten = (response.choices[0].message.content or "").strip()
            return rewritten or question
        except Exception:
            return question

    def _verify_answer(
        self,
        question: str,
        context: str,
        answer: str,
        allow_clarification: bool = True,
    ) -> str:
        if not settings.enable_answer_verification or not answer.strip():
            return answer
        verification_policy = (
            "If the context does not answer the question, ask for the smallest useful "
            "detail needed to identify the right product or document section."
            if allow_clarification
            else "Do not ask another question. If a reliable match cannot be made, say so "
            "and summarize only the closest result supported by the context."
        )
        try:
            response = self.openai.chat.completions.create(
                model=settings.openai_chat_model,
                messages=[{
                    "role": "user",
                    "content": (
                        "Verify the draft answer strictly against the supplied context. "
                        "Remove or correct every unsupported factual claim. Add the correct "
                        "[Source N] citation to every retained factual product or service claim. "
                        "Preserve a friendly, natural, concise customer-support tone while editing. "
                        "Use direct wording and contractions where appropriate, and do not make the "
                        "answer sound like a report or mention documents unless the customer asks. "
                        "Do not add outside knowledge. A source may "
                        "support claims only about the same named product or service described "
                        "in that source block. Return only the revised customer-facing answer. "
                        "Silently remove unsupported material; never mention verification, the "
                        "draft, supplied context, unsupported claims, or what was removed. If the "
                        "draft asks concise clarification questions and makes no product "
                        "claims, preserve those questions only when clarification is allowed. "
                        f"{verification_policy}\n\n"
                        f"Question:\n{question}\n\nContext:\n{context}\n\n"
                        f"Draft answer:\n{answer}\n\nVerified answer:"
                    ),
                }],
                temperature=0,
            )
            verified = (response.choices[0].message.content or "").strip()
            return verified or answer
        except Exception:
            return answer

    def _rerank(self, question: str, candidates: list[dict], limit: int) -> list[dict]:
        if self.cross_encoder and candidates:
            scores = self.cross_encoder.predict(
                [(question, item["content"]) for item in candidates]
            )
            ranked = [
                item for _, item in sorted(
                    zip(scores, candidates),
                    key=lambda pair: float(pair[0]),
                    reverse=True,
                )
            ]
            return ranked[:limit]
        if not settings.enable_reranking or len(candidates) <= limit:
            return candidates[:limit]
        try:
            listing = "\n\n".join(
                f"[{i}] Document: {item.get('document_name', 'Unknown')}\n"
                f"Evidence type: {item.get('evidence_type', 'text')}\n"
                f"{item['content'][:1200]}"
                for i, item in enumerate(candidates)
            )
            response = self.openai.chat.completions.create(
                model=settings.openai_chat_model,
                messages=[{
                    "role": "user",
                    "content": (
                        "Select only context chunks that directly help answer the question. "
                        "Reject chunks from unrelated subjects even if they share generic words. "
                        "Prefer native PDF text over OCR or vision extraction when both answer "
                        "the same factual specification. Use vision evidence for questions that "
                        "depend on a diagram, layout, or image. "
                        "For a request to list models, prioritize a chunk that explicitly says "
                        "models are included or available and preserves their exact model IDs. "
                        "For product or service recommendations, retain only chunks that describe "
                        "a candidate matching an explicit customer requirement. Return [] when no "
                        "chunk is directly relevant. "
                        f"Return at most {limit} chunk numbers, best first, as a JSON array "
                        "of integers only.\n\n"
                        f"Question: {question}\n\nChunks:\n{listing}"
                    ),
                }],
                temperature=0,
                max_tokens=80,
            )
            import json
            indices = json.loads(response.choices[0].message.content or "[]")
            selected = [
                candidates[i] for i in indices
                if isinstance(i, int) and 0 <= i < len(candidates)
            ]
            return selected[:limit]
        except Exception:
            return candidates[:limit]
