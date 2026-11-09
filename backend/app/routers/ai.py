from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.dependencies import get_current_user
from app.services.ai_service import generate_ai_response

import logging

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/ai",
    tags=["AI Assistant"]
)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)


class ChatResponse(BaseModel):
    response: str


@router.post("/chat", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    current_user=Depends(get_current_user)
):
    try:
        response = await generate_ai_response(request.message)

        return ChatResponse(response=response)

    except ValueError as error:
        raise HTTPException(
            status_code=503,
            detail=str(error)
        )

    except Exception:
        logger.exception("FarMe AI chatbot error")
        raise HTTPException(
            status_code=502,
            detail="The AI assistant is temporarily unavailable. Please try again."
        )