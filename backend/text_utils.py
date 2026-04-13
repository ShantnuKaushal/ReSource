import re

NOT_FOUND_RESPONSE = (
    "Not found in the uploaded context.\n\n"
    "- The current PDFs do not state this directly.\n"
    "- Ask about a nearby detail or upload a document that contains it.\n"
    "- Never invent, infer, or guess."
)

NO_ANSWER_PATTERNS = (
    "answer is not in the context",
    "not in the context",
    "not provided in the context",
    "not mentioned in the context",
    "cannot be determined from the context",
    "cannot be answered from the context",
    "the context does not contain",
)


def chunk_text(text, chunk_size=500):
    chunks = []
    for i in range(0, len(text), chunk_size):
        chunks.append(text[i:i + chunk_size])
    return chunks


def build_grounded_answer_prompt(context_text, user_question):
    return (
        "You answer questions strictly from the supplied PDF context.\n"
        "Write in clean Markdown for a polished chat UI.\n\n"
        "Rules:\n"
        "- Do not mention the prompt, the context, or say phrases like 'based on the provided context'.\n"
        "- If the answer is present, start with a direct answer sentence.\n"
        "- Add short bullet points only when they improve clarity.\n"
        "- If the user asks for a list, comparison, timeline, skills, or responsibilities, prefer bullets.\n"
        "- If the answer is missing, respond exactly with:\n"
        f"{NOT_FOUND_RESPONSE}\n\n"
        f"Context:\n{context_text}\n\n"
        f"Question: {user_question}"
    )


def normalize_grounded_answer(answer_text):
    normalized = (answer_text or "").replace("\r\n", "\n").strip()
    normalized = "\n".join(line.rstrip() for line in normalized.splitlines()).strip()
    normalized = re.sub(
        r"^(based on (the )?(provided )?context[:,]?\s*)",
        "",
        normalized,
        flags=re.IGNORECASE,
    ).strip()

    lowered = " ".join(normalized.lower().split())
    if any(pattern in lowered for pattern in NO_ANSWER_PATTERNS):
        return NOT_FOUND_RESPONSE

    return normalized or "I could not generate a grounded answer from the retrieved context."
