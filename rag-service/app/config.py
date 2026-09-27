from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    openai_api_key: str = ""
    rag_service_api_key: str = ""
    openai_embedding_model: str = "text-embedding-3-small"
    openai_chat_model: str = "gpt-4o-mini"
    chroma_persist_dir: str = "./chroma_data"
    fts_persist_path: str = ""
    chunk_size: int = 600
    chunk_overlap: int = 150
    embedding_batch_size: int = 128
    vector_store_batch_size: int = 500
    top_k: int = 6
    retrieval_candidates: int = 40
    minimum_relevance_score: float = 0.25
    enable_reranking: bool = True
    enable_answer_verification: bool = True
    enable_numeric_verification: bool = True
    conversation_history_messages: int = 16
    max_clarification_rounds: int = 2
    neighbor_chunks: int = 1
    enable_multilingual_search: bool = True
    enable_local_cross_encoder: bool = False
    cross_encoder_model: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"
    rag_service_port: int = 8000
    openai_vision_model: str = "gpt-4o-mini"
    describe_pdf_images: bool = True
    describe_full_visual_pages: bool = True
    vision_page_dpi: int = 300
    vision_max_tokens: int = 1400
    vision_page_character_limit: int = 1600
    min_vector_drawings_for_visual_page: int = 8
    min_image_size: int = 80  # px, skips tiny icons/bullets from triggering vision calls
    max_described_images_per_page: int = 3
    enable_local_ocr: bool = True
    ocr_min_page_characters: int = 80
    ocr_image_rich_pages: bool = True
    ocr_image_page_character_limit: int = 1200
    ocr_dpi: int = 300
    ocr_language: str = "eng"
    tesseract_cmd: str = ""
    openai_request_timeout_seconds: float = 120.0
    openai_max_retries: int = 5

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
