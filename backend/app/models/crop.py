from sqlalchemy import Boolean, Column, Integer, JSON, String

from app.db.database import Base


class Crop(Base):
    __tablename__ = "crop_library"

    key = Column(String(50), primary_key=True)
    name = Column(String(100), nullable=False)
    en = Column(String(100), nullable=False)
    emoji = Column(String(20), nullable=False)
    type = Column(String(20), nullable=False, index=True)
    maturity = Column(Integer, nullable=False)
    soils = Column(JSON, nullable=False)
    seasons = Column(JSON, nullable=False)
    temp = Column(JSON, nullable=False)
    big = Column(Boolean, nullable=False, default=False)