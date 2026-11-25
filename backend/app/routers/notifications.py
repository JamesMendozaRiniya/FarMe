from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.database import get_db
from app.models import NotificationState
from app.models.user import User
from app.schemas.notification import NotificationUpdate


router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("")
def get_notifications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    states = db.query(NotificationState).filter(
        NotificationState.user_id == current_user.id
    ).all()

    return [
        {
            "id": state.notif_id,
            "read": state.read,
            "deleted": state.deleted
        }
        for state in states
    ]


@router.patch("/{notif_id}")
def update_notification(
    notif_id: str,
    data: NotificationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    state = db.query(NotificationState).filter(
        NotificationState.user_id == current_user.id,
        NotificationState.notif_id == notif_id
    ).first()

    if not state:
        state = NotificationState(
            user_id=current_user.id,
            notif_id=notif_id,
            read=data.read,
            deleted=False
        )
        db.add(state)
    else:
        state.read = data.read

    db.commit()

    return {
        "id": notif_id,
        "read": state.read,
        "deleted": state.deleted
    }


@router.delete("/{notif_id}")
def delete_notification(
    notif_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    state = db.query(NotificationState).filter(
        NotificationState.user_id == current_user.id,
        NotificationState.notif_id == notif_id
    ).first()

    if not state:
        state = NotificationState(
            user_id=current_user.id,
            notif_id=notif_id,
            read=False,
            deleted=True
        )
        db.add(state)
    else:
        state.deleted = True

    db.commit()

    return {"message": "Notification deleted successfully."}