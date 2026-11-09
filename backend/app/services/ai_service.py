from google import genai
from google.genai import types

from app.core.config import settings
from app.core.ai_prompt import SYSTEM_PROMPT, FEW_SHOT_EXAMPLES


MODEL_NAME = "gemini-3.5-flash-lite"


async def generate_ai_response(user_message: str) -> str:
    if not settings.GEMINI_API_KEY:
        raise ValueError("Gemini API key is not configured.")

    contents = []

    for example in FEW_SHOT_EXAMPLES:
        contents.append(
            types.Content(
                role="user",
                parts=[types.Part.from_text(text=example["user"])],
            )
        )

        contents.append(
            types.Content(
                role="model",
                parts=[types.Part.from_text(text=example["assistant"])],
            )
        )

    contents.append(
        types.Content(
            role="user",
            parts=[types.Part.from_text(text=user_message)],
        )
    )

    async with genai.Client(
        api_key=settings.GEMINI_API_KEY
    ).aio as client:
        response = await client.models.generate_content(
            model=MODEL_NAME,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                temperature=0.7,
                max_output_tokens=1024,
            ),
        )

    if not response.text:
        raise ValueError("Gemini did not return a response.")

    return response.text.strip()
