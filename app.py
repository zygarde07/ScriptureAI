import streamlit as st

# The retrieval and Gemini logic lives in rag.py (shared with the web API).
# It reads GEMINI_API_KEY from the local .env file or the environment.
import rag

if not rag.api_key_configured():
    st.set_page_config(page_title="Scripture AI", layout="wide")
    st.error(
        "GEMINI_API_KEY is not set. Put your real Gemini API key in your "
        "local `.env` file (copy `.env.example` to `.env` and replace the "
        "placeholder), then restart the app."
    )
    st.stop()

# =========================
# LOAD RESOURCES
# =========================
@st.cache_resource
def load_resources():
    rag.warm_up()  # loads the embedding model and the database once
    return True


load_resources()

# =========================
# UI
# =========================
st.set_page_config(page_title="Scripture AI", layout="wide")

st.title("🧠 Scripture AI")
st.caption("Retrieval-Augmented Generation System for Classical Scripture Research")

if "chat_history" not in st.session_state:
    st.session_state.chat_history = []

user_input = st.chat_input("Ask a question about the scriptures...")

if user_input:

    st.session_state.chat_history.append(("user", user_input))

    with st.spinner("Searching scriptures..."):

        # Embed the question, retrieve the closest passages and ask Gemini
        # (all of this happens inside rag.py)
        result = rag.answer_question(user_input)
        answer = result["answer"] or "No answer was generated."

        st.session_state.chat_history.append(("assistant", answer))

# =========================
# DISPLAY CHAT
# =========================
for role, message in st.session_state.chat_history:
    with st.chat_message(role):
        st.write(message)