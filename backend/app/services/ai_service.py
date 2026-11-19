import asyncio
import json

from google import genai
from google.genai import types
from google.genai.errors import ServerError

from app.core.config import settings
from app.core.ai_prompt import SYSTEM_PROMPT, FEW_SHOT_EXAMPLES


MODEL_NAME = settings.GEMINI_MODEL


async def generate_ai_response(
    user_message: str,
    history: list[dict] | None = None,
    context: dict | None = None
) -> str:

    if not settings.GEMINI_API_KEY:
        raise ValueError("Gemini API key is not configured.")

    contents = []

    for example in FEW_SHOT_EXAMPLES:
        contents.append(
            types.Content(
                role="user",
                parts=[
                    types.Part.from_text(text=example["user"])
                ],
            )
        )

        contents.append(
            types.Content(
                role="model",
                parts=[
                    types.Part.from_text(text=example["assistant"])
                ],
            )
        )

    for message in history or []:
        role = (
            "user"
            if message["role"] == "user"
            else "model"
        )

        contents.append(
            types.Content(
                role=role,
                parts=[
                    types.Part.from_text(text=message["content"])
                ],
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
                types.Part.from_text(text=f"{user_message}{context_text}")
            ],
        )
    )

    async with genai.Client(
        api_key=settings.GEMINI_API_KEY
    ).aio as client:

        response = None

        for attempt in range(3):
            try:
                response = await client.models.generate_content(
                    model=MODEL_NAME,
                    contents=contents,
                    config=types.GenerateContentConfig(
                        system_instruction=SYSTEM_PROMPT,
                        temperature=0.7,
                        max_output_tokens=1024,
                    ),
                )
                break

            except ServerError as error:
                if error.code != 503 or attempt == 2:
                    raise

                await asyncio.sleep(2 ** (attempt + 1))

    if not response or not response.text:
        raise ValueError("Gemini did not return a response.")

    return response.text.strip()
