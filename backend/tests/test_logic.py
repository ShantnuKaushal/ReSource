from text_utils import chunk_text, normalize_grounded_answer

def test_chunk_text_size():
    # Create a string of 1200 'a's
    long_text = "a" * 1200
    # Break it into chunks of 500 characters
    chunks = chunk_text(long_text, chunk_size=500)
    
    # We expect 3 chunks: 500, 500, and 200
    assert len(chunks) == 3
    assert len(chunks[0]) == 500
    assert len(chunks[2]) == 200

def test_chunk_text_content():
    # Ensure no characters are lost
    original_text = "The quick brown fox jumps over the lazy dog."
    chunks = chunk_text(original_text, chunk_size=10)
    
    reconstructed = "".join(chunks)
    assert reconstructed == original_text


def test_normalize_grounded_answer_removes_context_preamble():
    answer = "Based on the provided context: Python is listed as a required skill."

    assert normalize_grounded_answer(answer) == "Python is listed as a required skill."


def test_normalize_grounded_answer_standardizes_missing_answer():
    answer = "The answer is not in the context."

    assert normalize_grounded_answer(answer).startswith("Not found in the uploaded context.")
