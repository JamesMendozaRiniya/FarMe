import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.database import get_db
from app.models.chat import ChatConversation, ChatMessage
from app.services.ai_service import generate_ai_response

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/ai",
    tags=["AI Assistant"]
)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    conversation_id: int | None = Field(default=None, gt=0)
    context: dict | None = None


class ChatResponse(BaseModel):
    response: str
    conversation_id: int


@router.post("/chat", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        if request.conversation_id is not None:
            conversation = db.query(ChatConversation).filter(
                ChatConversation.id == request.conversation_id,
                ChatConversation.user_id == current_user.id
            ).first()

            if conversation is None:
                raise HTTPException(
                    status_code=404,
                    detail="Conversation not found."
                )
        else:
            conversation = ChatConversation(
                user_id=current_user.id,
                title=request.message[:150]
            )

            db.add(conversation)
            db.flush()

        previous_messages = (
            db.query(ChatMessage)
            .filter(
                ChatMessage.conversation_id == conversation.id
            )
            .order_by(ChatMessage.created_at.desc(), ChatMessage.id.desc())
            .limit(20)
            .all()
        )

        previous_messages.reverse()

        history = [
            {
                "role": message.role,
                "content": message.content
            }
            for message in previous_messages
        ]

        response = await generate_ai_response(
            user_message=request.message,
            history=history,
            context=request.context,
            username=current_user.username
        )

        db.add_all([
            ChatMessage(
                conversation_id=conversation.id,
                role="user",
                content=request.message
            ),
            ChatMessage(
                conversation_id=conversation.id,
                role="assistant",
                content=response
            )
        ])

        db.commit()

        return ChatResponse(
            response=response,
            conversation_id=conversation.id
        )

    except HTTPException:
        db.rollback()
        raise

    except ValueError as error:
        db.rollback()
        raise HTTPException(
            status_code=503,
            detail=str(error)
        )

    except Exception:
        db.rollback()
        logger.exception("FarMe AI chatbot error")

        raise HTTPException(
            status_code=502,
            detail="The AI assistant is temporarily unavailable. Please try again."
        )