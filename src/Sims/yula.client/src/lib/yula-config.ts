/** Varsayılan Yula modeli — env ile geçersiz kılınabilir (YULA_MODEL). */
export const DEFAULT_YULA_MODEL =
  process.env.YULA_MODEL ?? "gemma4:12b-mlx";

/** Ollama API kök adresi (client ve server paylaşımlı sabit). */
export const DEFAULT_OLLAMA_URL = "http://localhost:11434";
