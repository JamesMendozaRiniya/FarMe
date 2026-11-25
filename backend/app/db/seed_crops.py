from app.db.database import SessionLocal
from app.models.crop import Crop


CROPS = [
    {
        "key": "kamatis",
        "name": "Kamatis",
        "en": "Tomato",
        "emoji": "🍅",
        "type": "vegetable",
        "maturity": 70,
        "soils": ["Loam", "Sandy"],
        "seasons": ["dry"],
        "temp": [18, 30],
        "big": False
    },
    {
        "key": "talong",
        "name": "Talong",
        "en": "Eggplant",
        "emoji": "🍆",
        "type": "vegetable",
        "maturity": 85,
        "soils": ["Loam", "Silty", "Clay"],
        "seasons": ["wet", "dry"],
        "temp": [22, 35],
        "big": False
    },
    {
        "key": "ampalaya",
        "name": "Ampalaya",
        "en": "Bitter gourd",
        "emoji": "🥒",
        "type": "vegetable",
        "maturity": 75,
        "soils": ["Loam", "Sandy"],
        "seasons": ["wet", "dry"],
        "temp": [24, 35],
        "big": False
    },
    {
        "key": "sitaw",
        "name": "Sitaw",
        "en": "String beans",
        "emoji": "🫛",
        "type": "vegetable",
        "maturity": 60,
        "soils": ["Loam", "Sandy", "Silty"],
        "seasons": ["wet", "dry"],
        "temp": [22, 34],
        "big": False
    },
    {
        "key": "kangkong",
        "name": "Kangkong",
        "en": "Water spinach",
        "emoji": "🥬",
        "type": "vegetable",
        "maturity": 30,
        "soils": ["Clay", "Silty", "Loam"],
        "seasons": ["wet"],
        "temp": [25, 35],
        "big": False
    },
    {
        "key": "saging",
        "name": "Saging",
        "en": "Banana",
        "emoji": "🍌",
        "type": "fruit",
        "maturity": 270,
        "soils": ["Loam", "Silty", "Clay"],
        "seasons": ["wet", "dry"],
        "temp": [24, 35],
        "big": True
    },
    {
        "key": "papaya",
        "name": "Papaya",
        "en": "Papaya",
        "emoji": "🍈",
        "type": "fruit",
        "maturity": 270,
        "soils": ["Loam", "Sandy"],
        "seasons": ["wet", "dry"],
        "temp": [24, 35],
        "big": True
    },
    {
        "key": "pinya",
        "name": "Pinya",
        "en": "Pineapple",
        "emoji": "🍍",
        "type": "fruit",
        "maturity": 450,
        "soils": ["Sandy", "Loam"],
        "seasons": ["wet", "dry"],
        "temp": [22, 32],
        "big": False
    },
    {
        "key": "pakwan",
        "name": "Pakwan",
        "en": "Watermelon",
        "emoji": "🍉",
        "type": "fruit",
        "maturity": 80,
        "soils": ["Sandy", "Loam"],
        "seasons": ["dry"],
        "temp": [24, 34],
        "big": False
    },
    {
        "key": "mangga",
        "name": "Mangga",
        "en": "Mango",
        "emoji": "🥭",
        "type": "fruit",
        "maturity": 1095,
        "soils": ["Loam", "Clay", "Sandy"],
        "seasons": ["wet", "dry"],
        "temp": [24, 35],
        "big": True
    }
]


def seed_crops():
    db = SessionLocal()

    try:
        inserted = 0
        skipped = 0

        for crop_data in CROPS:
            existing_crop = (
                db.query(Crop)
                .filter(Crop.key == crop_data["key"])
                .first()
            )

            if existing_crop:
                skipped += 1
                continue

            db.add(Crop(**crop_data))
            inserted += 1

        db.commit()

        print(f"Inserted: {inserted}")
        print(f"Skipped: {skipped}")

    except Exception:
        db.rollback()
        raise

    finally:
        db.close()


if __name__ == "__main__":
    seed_crops()
