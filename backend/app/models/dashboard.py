from datetime import datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class Slot(Base):
    __tablename__ = "slots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    soil: Mapped[str] = mapped_column(String(20), nullable=False)
    width_m: Mapped[float] = mapped_column(Float, nullable=False)
    length_m: Mapped[float] = mapped_column(Float, nullable=False)

    location: Mapped[str] = mapped_column(String(255), nullable=False)
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lon: Mapped[float | None] = mapped_column(Float, nullable=True)
    place: Mapped[str | None] = mapped_column(String(255), nullable=True)

    last_watered: Mapped[datetime | None] = mapped_column(
    	DateTime(timezone=True),
    	nullable=True
	)

    plants: Mapped[list["Plant"]] = relationship(
        back_populates="slot",
        cascade="all, delete-orphan"
    )

    harvests: Mapped[list["Harvest"]] = relationship(
        back_populates="slot",
        cascade="all, delete-orphan"
    )

    notes: Mapped[list["Note"]] = relationship(
        back_populates="slot",
        cascade="all, delete-orphan"
    )

    waterings: Mapped[list["Watering"]] = relationship(
        back_populates="slot",
        cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index(
            "uq_slots_user_name_lower",
            user_id,
            func.lower(name),
            unique=True
        ),
    )


class Plant(Base):
    __tablename__ = "plants"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    slot_id: Mapped[int] = mapped_column(
        ForeignKey("slots.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    row: Mapped[int] = mapped_column(Integer, nullable=False)
    col: Mapped[int] = mapped_column(Integer, nullable=False)
    crop_key: Mapped[str] = mapped_column(String(100), nullable=False)

    planted_on: Mapped[Date] = mapped_column(Date, nullable=False)
    last_harvested: Mapped[Date | None] = mapped_column(
        Date,
        nullable=True
    )
    last_watered: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )

    slot: Mapped["Slot"] = relationship(back_populates="plants")

    __table_args__ = (
        Index(
            "uq_plants_slot_position",
            slot_id,
            row,
            col,
            unique=True
        ),
    )


class Harvest(Base):
    __tablename__ = "harvests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    slot_id: Mapped[int] = mapped_column(
        ForeignKey("slots.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    plant_id: Mapped[int | None] = mapped_column(
        ForeignKey("plants.id", ondelete="SET NULL"),
        nullable=True
    )

    crop_key: Mapped[str] = mapped_column(String(100), nullable=False)
    row: Mapped[int] = mapped_column(Integer, nullable=False)
    col: Mapped[int] = mapped_column(Integer, nullable=False)

    planted_on: Mapped[Date] = mapped_column(Date, nullable=False)
    date: Mapped[Date] = mapped_column(Date, nullable=False)

    amount: Mapped[str] = mapped_column(String(100), nullable=False)
    kept: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    slot: Mapped["Slot"] = relationship(back_populates="harvests")


class Note(Base):
    __tablename__ = "notes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    slot_id: Mapped[int] = mapped_column(
        ForeignKey("slots.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    crop_keys: Mapped[list] = mapped_column(JSON, nullable=False)
    plant_ids: Mapped[list | None] = mapped_column(JSON, nullable=True)

    date: Mapped[Date] = mapped_column(Date, nullable=False)
    text: Mapped[str] = mapped_column(String(2000), nullable=False)

    slot: Mapped["Slot"] = relationship(back_populates="notes")


class Watering(Base):
    __tablename__ = "waterings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    slot_id: Mapped[int] = mapped_column(
        ForeignKey("slots.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    at: Mapped[datetime] = mapped_column(
    	DateTime(timezone=True),
    	nullable=False
    )

    slot: Mapped["Slot"] = relationship(back_populates="waterings")


class NotificationState(Base):
    __tablename__ = "notification_states"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    notif_id: Mapped[str] = mapped_column(String(255), nullable=False)
    read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    __table_args__ = (
        Index(
            "uq_notification_user_notif",
            user_id,
            notif_id,
            unique=True
        ),
    )
