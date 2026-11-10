import json
from google import genai
from google.genai import types

from app.core.config import settings
from app.core.ai_prompt import SYSTEM_PROMPT, FEW_SHOT_EXAMPLES


MODEL_NAME = settings.GEMINI_MODEL


async def generate_ai_response(
    user_message: str,
    context: dict | None = None
) -> str:
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

    context_text = ""

    if context:
        context_text = (
            "\n\nFARME FARM AND WEATHER CONTEXT:\n"
            + json.dumps(context, ensure_ascii=False, indent=2)
            + "\n\nUse this information when relevant to the user's question. "
            "Give practical farming suggestions based on the available data. "
            "Do not invent missing weather or farm information."
        )

    contents.append(
        types.Content(
            role="user",
            parts=[
                types.Part.from_text(
                    text=f"{user_message}{context_text}"
                )
            ],
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