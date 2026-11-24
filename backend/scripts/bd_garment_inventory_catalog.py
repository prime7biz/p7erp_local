"""
Catalog data for the Bangladesh garment factory inventory seed.

This file holds plain data only (lists and dictionaries). It has no database code.

How to use it:
- To add an item, add a name to the right ``"items"`` list below and run the seed again.
  Existing items are never changed or duplicated.
- Each subcategory block sets the defaults (unit, godown, stock group, HSN code, tracking).
  An item only needs ``override(...)`` when it differs from those defaults.

Important: HSN codes are reference values only. Check them against the NBR tariff before
you use them on official documents (VAT / customs / bond papers).
"""

from __future__ import annotations


def override(name: str, **changes) -> dict:
    """One item that differs from its subcategory defaults (unit, hsn, description)."""
    return {"name": name, **changes}


# ---------------------------------------------------------------------------
# 1. Units of measure
# ---------------------------------------------------------------------------
# Code -> display name. Created only when the tenant does not already have that unit.
UNIT_NAMES: dict[str, str] = {
    "KG": "Kilogram",
    "YD": "Yard",
    "MTR": "Metre",
    "PCS": "Pieces",
    "GROSS": "Gross (144 pcs)",
    "DOZ": "Dozen",
    "CONE": "Cone",
    "ROLL": "Roll",
    "CTN": "Carton",
    "PKT": "Packet",
    "BOX": "Box",
    "LTR": "Litre",
    "GAL": "Gallon",
    "SET": "Set",
    "PAIR": "Pair",
}

# Older tenants already have units under other names (for example "Pcs" from
# seed_new_tenant_minimum.py). The seed reuses those instead of adding a second unit
# with the same meaning. Matching ignores upper / lower case.
UNIT_ALIASES: dict[str, list[str]] = {
    "YD": ["Yard"],
    "MTR": ["M", "Mtr", "Metre"],
    "PCS": ["Pcs", "Pc"],
    "DOZ": ["Dz"],
    "LTR": ["L", "Litre"],
    "CTN": ["Carton"],
    "PKT": ["Packet"],
    "GAL": ["Gallon"],
    "PAIR": ["Pr"],
}


# ---------------------------------------------------------------------------
# 2. Item categories (top level)
# ---------------------------------------------------------------------------
# (category_code, name, description)
CATEGORIES: list[tuple[str, str, str]] = [
    ("YARN", "Yarn", "Cotton, blended, polyester, viscose and elastane yarn"),
    ("FABRIC", "Fabric", "Knit, single jersey, lycra, MMF, imported, denim, woven and lining fabric"),
    ("TRIM", "Trims & Accessories", "Zippers, buttons, thread, labels, elastics, interlining, lingerie trims"),
    ("PACK", "Packing Materials", "Polybags, cartons, tapes, hangers, tags"),
    ("DYE", "Dyes & Chemicals", "Dyes, dyeing auxiliaries, finishing and washing chemicals"),
    ("SPARE", "Spare Parts", "Sewing machine needles, machine parts, belts and oil"),
    ("CONSUMABLE", "Factory Consumables", "Cutting, sewing and PPE consumables"),
    ("STATIONERY", "Office & Factory Stationery", "Paper, pens, files, staplers and printer supplies"),
]


# ---------------------------------------------------------------------------
# 3. Stock groups (for stock reports and valuation)
# ---------------------------------------------------------------------------
# (group_code, name, parent_group_code or None, stock_nature)
# stock_nature: RAW_MATERIAL | WORK_IN_PROCESS | FINISHED_GOODS | OTHER
# Parents must be listed before their children.
STOCK_GROUPS: list[tuple[str, str, str | None, str]] = [
    ("SG-YARN", "Yarn", None, "RAW_MATERIAL"),
    ("SG-YRN-COTTON", "Cotton Yarn", "SG-YARN", "RAW_MATERIAL"),
    ("SG-YRN-BLENDED", "Blended Yarn", "SG-YARN", "RAW_MATERIAL"),
    ("SG-YRN-SYNTHETIC", "Synthetic / MMF Yarn", "SG-YARN", "RAW_MATERIAL"),
    ("SG-YRN-SPECIALTY", "Specialty Yarn", "SG-YARN", "RAW_MATERIAL"),
    ("SG-FABRIC", "Fabric", None, "RAW_MATERIAL"),
    ("SG-FAB-GREY", "Grey Knit Fabric", "SG-FABRIC", "RAW_MATERIAL"),
    ("SG-FAB-SJ", "Single Jersey & Lycra Fabric", "SG-FABRIC", "RAW_MATERIAL"),
    ("SG-FAB-KNIT", "Knitwear Fabric", "SG-FABRIC", "RAW_MATERIAL"),
    ("SG-FAB-MMF", "MMF Knit & Activewear Fabric", "SG-FABRIC", "RAW_MATERIAL"),
    ("SG-FAB-CHINA", "Imported China Fabric", "SG-FABRIC", "RAW_MATERIAL"),
    ("SG-FAB-INTIMATE", "Lingerie & Underwear Fabric", "SG-FABRIC", "RAW_MATERIAL"),
    ("SG-FAB-DENIM", "Denim Fabric", "SG-FABRIC", "RAW_MATERIAL"),
    ("SG-FAB-WOVEN", "Woven Fabric", "SG-FABRIC", "RAW_MATERIAL"),
    ("SG-FAB-LINING", "Lining & Pocketing", "SG-FABRIC", "RAW_MATERIAL"),
    ("SG-TRIM", "Trims & Accessories", None, "RAW_MATERIAL"),
    ("SG-TRM-GENERAL", "General Trims", "SG-TRIM", "RAW_MATERIAL"),
    ("SG-TRM-INTIMATE", "Lingerie Trims", "SG-TRIM", "RAW_MATERIAL"),
    ("SG-PACK", "Packing Materials", None, "RAW_MATERIAL"),
    ("SG-CHEM", "Dyes & Chemicals", None, "RAW_MATERIAL"),
    ("SG-WIP", "Work In Process", None, "WORK_IN_PROCESS"),
    ("SG-FG", "Finished Goods", None, "FINISHED_GOODS"),
    ("SG-SPARE", "Spare Parts", None, "OTHER"),
    ("SG-CONSUMABLE", "Factory Consumables", None, "OTHER"),
    ("SG-STATIONERY", "Office & Factory Stationery", None, "OTHER"),
]


# ---------------------------------------------------------------------------
# 4. Godowns (warehouses)
# ---------------------------------------------------------------------------
# (warehouse_code, name, is_bonded, address)
# Raw-material godowns are bonded because the factory's raw materials sit under the
# Bonded Warehouse License (VAT exempt). Spares, stationery and finished goods are not bonded.
GODOWNS: list[tuple[str, str, bool, str]] = [
    ("YARN-GODOWN", "Yarn Godown", True, "Bonded raw material store - yarn cones and bags"),
    ("KNIT-GODOWN", "Knitting Godown", True, "Bonded raw material store - grey / knitted fabric rolls"),
    ("FABRIC-GODOWN", "Fabric Godown", True, "Bonded raw material store - finished knit, MMF, imported, denim, woven and lining"),
    ("ACC-GODOWN", "Accessories Godown", True, "Bonded raw material store - trims, thread, labels, interlining, cutting and sewing consumables"),
    ("PACK-GODOWN", "Packing & Carton Godown", True, "Bonded raw material store - polybags, cartons, tapes, hangers, tags"),
    ("CHEM-GODOWN", "Chemical & Dye Godown", True, "Bonded raw material store - dyes, auxiliaries, washing chemicals (keep away from heat)"),
    ("SPARE-GODOWN", "Maintenance & Spare Parts Godown", False, "Maintenance store - needles, machine parts, oil, PPE"),
    ("OFF-STATIONERY-GODOWN", "Office Stationeries Godown", False, "Admin store - paper, pens, files, toner"),
    ("FG-GODOWN", "Finished Goods Godown", False, "Ready-to-ship garments"),
]


# ---------------------------------------------------------------------------
# 5. Subcategories with their items
# ---------------------------------------------------------------------------
# Every block below is one subcategory. Keys:
#   code         unique subcategory code (must be unique for the tenant)
#   category     category code from CATEGORIES
#   name         display name
#   unit         default unit code (from UNIT_NAMES)
#   godown       default godown code (from GODOWNS)
#   stock_group  stock group code (from STOCK_GROUPS)
#   hsn          default HSN reference code
#   batch        True = track by lot / batch (dye lot, roll lot)
#   expiry       True = track expiry date (chemicals)
#   description  optional text copied to each item
#   items        list of names, or override(...) for one that differs
SUBCATEGORIES: list[dict] = [
    # ----------------------------- YARN -----------------------------
    {
        "code": "YRN-CTN", "category": "YARN", "name": "Cotton Yarn", "unit": "KG",
        "godown": "YARN-GODOWN", "stock_group": "SG-YRN-COTTON", "hsn": "5205", "batch": True, "expiry": False,
        "items": [
            "Carded Cotton Yarn Ne 10/1", "Carded Cotton Yarn Ne 16/1", "Carded Cotton Yarn Ne 20/1",
            "Carded Cotton Yarn Ne 24/1", "Carded Cotton Yarn Ne 26/1", "Carded Cotton Yarn Ne 28/1",
            "Carded Cotton Yarn Ne 30/1", "Carded Cotton Yarn Ne 32/1",
            "Combed Cotton Yarn Ne 20/1", "Combed Cotton Yarn Ne 24/1", "Combed Cotton Yarn Ne 26/1",
            "Combed Cotton Yarn Ne 28/1", "Combed Cotton Yarn Ne 30/1", "Combed Cotton Yarn Ne 34/1",
            "Combed Cotton Yarn Ne 40/1", "Combed Cotton Yarn Ne 50/1",
            "Compact Combed Cotton Yarn Ne 30/1", "Compact Combed Cotton Yarn Ne 40/1",
            "Organic Cotton Combed Yarn Ne 30/1", "Organic Cotton Combed Yarn Ne 40/1",
            "Cotton Slub Yarn Ne 24/1", "Cotton Slub Yarn Ne 30/1",
            "Grey Melange Cotton Yarn 10% Ne 26/1", "Grey Melange Cotton Yarn 10% Ne 30/1",
            "Grey Melange Cotton Yarn 15% Ne 26/1", "Grey Melange Cotton Yarn 15% Ne 30/1",
            "Open-End Rotor Cotton Yarn Ne 10/1", "Open-End Rotor Cotton Yarn Ne 16/1",
            "Open-End Rotor Cotton Yarn Ne 20/1",
            "Two-Ply Cotton Yarn Ne 40/2", "Two-Ply Cotton Yarn Ne 60/2",
        ],
    },
    {
        "code": "YRN-BLD", "category": "YARN", "name": "Blended Yarn", "unit": "KG",
        "godown": "YARN-GODOWN", "stock_group": "SG-YRN-BLENDED", "hsn": "5205", "batch": True, "expiry": False,
        "items": [
            "CVC 60/40 Yarn Ne 20/1", "CVC 60/40 Yarn Ne 26/1", "CVC 60/40 Yarn Ne 30/1", "CVC 60/40 Yarn Ne 34/1",
            "CVC 80/20 Yarn Ne 26/1", "CVC 80/20 Yarn Ne 30/1",
            override("PC 65/35 Yarn Ne 20/1", hsn="5509"),
            override("PC 65/35 Yarn Ne 30/1", hsn="5509"),
            override("PC 65/35 Yarn Ne 45/1", hsn="5509"),
            "Cotton-Viscose 50/50 Melange Yarn Ne 30/1",
        ],
    },
    {
        "code": "YRN-SYN", "category": "YARN", "name": "Polyester & MMF Yarn", "unit": "KG",
        "godown": "YARN-GODOWN", "stock_group": "SG-YRN-SYNTHETIC", "hsn": "5509", "batch": True, "expiry": False,
        "items": [
            "Spun Polyester Yarn Ne 30/1", "Spun Polyester Yarn Ne 40/1",
            override("Polyester DTY 75D/72F", hsn="5402"),
            override("Polyester DTY 150D/48F", hsn="5402"),
            override("Polyester DTY 150D/144F Micro", hsn="5402"),
            override("Polyester DTY 300D/96F", hsn="5402"),
            override("Polyester FDY 75D/36F", hsn="5402"),
            override("Polyester FDY 150D/48F", hsn="5402"),
            override("Cationic Dyeable Polyester DTY 150D/48F", hsn="5402"),
            override("Recycled Polyester rPET DTY 75D/72F", hsn="5402"),
            override("Recycled Polyester rPET DTY 150D/48F", hsn="5402"),
            override("Nylon 6/66 DTY 40D/12F", hsn="5402"),
            override("Nylon 6/66 DTY 70D/24F", hsn="5402"),
            override("Nylon 6/66 DTY 70D/68F", hsn="5402"),
        ],
    },
    {
        "code": "YRN-VIS", "category": "YARN", "name": "Viscose, Linen & Sweater Yarn", "unit": "KG",
        "godown": "YARN-GODOWN", "stock_group": "SG-YRN-SPECIALTY", "hsn": "5509", "batch": True, "expiry": False,
        "items": [
            "Viscose Ring-Spun Yarn Ne 30/1", "Viscose Ring-Spun Yarn Ne 40/1",
            "Modal Yarn Ne 40/1", "Micro-Modal Yarn Ne 40/1",
            "Tencel / Lyocell Yarn Ne 30/1", "Cotton-Bamboo Yarn Ne 30/1", "Cotton-Linen Yarn Ne 21/1",
            "100% Acrylic Sweater Yarn 2/28 Nm", "100% Acrylic Sweater Yarn 2/32 Nm",
            "Cotton-Acrylic 60/40 Sweater Yarn 2/32 Nm",
        ],
    },
    {
        "code": "YRN-ELS", "category": "YARN", "name": "Elastane & Core-Spun Yarn", "unit": "KG",
        "godown": "YARN-GODOWN", "stock_group": "SG-YRN-SPECIALTY", "hsn": "5402", "batch": True, "expiry": False,
        "items": [
            "Bare Spandex Yarn 20D", "Bare Spandex Yarn 30D", "Bare Spandex Yarn 40D", "Bare Spandex Yarn 70D",
            "Cotton-Lycra Core-Spun Yarn Ne 16/1 + 70D (Denim)",
            "Cotton-Lycra Core-Spun Yarn Ne 30/1 + 40D",
        ],
    },
    # ----------------------------- FABRIC -----------------------------
    {
        "code": "FAB-GREY", "category": "FABRIC", "name": "Grey Knit Fabric", "unit": "KG",
        "godown": "KNIT-GODOWN", "stock_group": "SG-FAB-GREY", "hsn": "6006", "batch": True, "expiry": False,
        "items": [
            "Grey Single Jersey 140 GSM", "Grey Single Jersey 160 GSM", "Grey Single Jersey 180 GSM", "Grey Single Jersey 200 GSM",
            "Grey Cotton-Lycra SJ 95/5 160 GSM", "Grey Cotton-Lycra SJ 95/5 180 GSM",
            "Grey Cotton-Lycra SJ 95/5 200 GSM", "Grey Cotton-Lycra SJ 95/5 220 GSM",
            "Grey 1x1 Rib 180 GSM", "Grey 1x1 Rib 200 GSM", "Grey 1x1 Rib 220 GSM",
            "Grey 1x1 Lycra Rib 200 GSM", "Grey 1x1 Lycra Rib 220 GSM",
            "Grey 2x2 Lycra Rib 220 GSM", "Grey 2x2 Lycra Rib 240 GSM",
            "Grey Pique / Lacoste 200 GSM", "Grey Pique / Lacoste 220 GSM",
            "Grey Interlock 220 GSM", "Grey Interlock 240 GSM",
            override("Grey 2-Thread French Terry 240 GSM", hsn="6001"),
            override("Grey 2-Thread French Terry 260 GSM", hsn="6001"),
            override("Grey 3-Thread Fleece 280 GSM", hsn="6001"),
            override("Grey 3-Thread Fleece 320 GSM", hsn="6001"),
        ],
    },
    {
        "code": "FAB-SJ", "category": "FABRIC", "name": "Single Jersey & Lycra Knit", "unit": "KG",
        "godown": "FABRIC-GODOWN", "stock_group": "SG-FAB-SJ", "hsn": "6006", "batch": True, "expiry": False,
        "items": [
            "100% Cotton Single Jersey 130 GSM", "100% Cotton Single Jersey 140 GSM", "100% Cotton Single Jersey 150 GSM",
            "100% Cotton Single Jersey 160 GSM", "100% Cotton Single Jersey 180 GSM", "100% Cotton Single Jersey 200 GSM",
            "100% Cotton Single Jersey 220 GSM", "100% Cotton Single Jersey 240 GSM", "100% Cotton Single Jersey 260 GSM",
            "Organic Cotton Single Jersey 160 GSM", "Organic Cotton Single Jersey 180 GSM",
            "Cotton-Lycra SJ 95/5 150 GSM", "Cotton-Lycra SJ 95/5 160 GSM", "Cotton-Lycra SJ 95/5 180 GSM",
            "Cotton-Lycra SJ 95/5 200 GSM", "Cotton-Lycra SJ 95/5 220 GSM",
            "Cotton-Lycra SJ 92/8 High-Stretch 190 GSM", "Cotton-Lycra SJ 92/8 High-Stretch 210 GSM",
            "Cotton Slub Single Jersey 150 GSM", "Cotton Slub Single Jersey 170 GSM",
            "Grey Melange Single Jersey 160 GSM", "Grey Melange Single Jersey 180 GSM", "Grey Melange Single Jersey 200 GSM",
            "CVC 60/40 Single Jersey 160 GSM", "CVC 60/40 Single Jersey 180 GSM",
            "CVC-Lycra Single Jersey 180 GSM", "PC 65/35 Single Jersey 160 GSM",
            "Viscose-Lycra SJ 95/5 170 GSM", "Viscose-Lycra SJ 95/5 190 GSM",
            "Modal-Lycra SJ 95/5 180 GSM", "Bamboo-Lycra SJ 95/5 190 GSM",
            "Yarn-Dyed Auto-Stripe Single Jersey 160 GSM", "Yarn-Dyed Auto-Stripe Single Jersey 180 GSM",
            "Yarn-Dyed Feeder Stripe Lycra SJ 180 GSM",
            "AOP / Rotary Print-Ready Cotton SJ 160 GSM", "AOP / Rotary Print-Ready Cotton SJ 180 GSM",
            "Enzyme / Bio-Washed Combed Cotton SJ 180 GSM",
        ],
    },
    {
        "code": "FAB-KNIT", "category": "FABRIC", "name": "Knitwear (Rib, Pique, Interlock, Terry, Fleece)", "unit": "KG",
        "godown": "FABRIC-GODOWN", "stock_group": "SG-FAB-KNIT", "hsn": "6006", "batch": True, "expiry": False,
        "items": [
            "1x1 Cotton Rib 180 GSM", "1x1 Cotton Rib 200 GSM",
            "1x1 Cotton-Lycra Rib 95/5 200 GSM", "1x1 Cotton-Lycra Rib 95/5 220 GSM", "1x1 Cotton-Lycra Rib 95/5 240 GSM",
            "2x2 Cotton-Lycra Rib 220 GSM", "2x2 Cotton-Lycra Rib 260 GSM", "2x2 Cotton-Lycra Rib 280 GSM",
            "4x2 / Drop-Needle Rib 220 GSM", "Ottoman Knit Rib 240 GSM",
            "Single Pique / Lacoste 190 GSM", "Single Pique / Lacoste 210 GSM",
            "Double Pique / CVC Pique 220 GSM", "Double Pique / CVC Pique 240 GSM",
            "Lycra Pique 95/5 210 GSM",
            "Cotton Interlock 200 GSM", "Cotton Interlock 220 GSM", "Cotton Interlock 240 GSM",
            "Cotton-Lycra Interlock 240 GSM",
            "Flat-Knit Polo Collar & Cuff",
            override("2-Thread French Terry Cotton 240 GSM", hsn="6001"),
            override("2-Thread French Terry Cotton 260 GSM", hsn="6001"),
            override("2-Thread French Terry Cotton 280 GSM", hsn="6001"),
            override("Lycra French Terry 95/5 260 GSM", hsn="6001"),
            override("3-Thread Unbrushed Heavy Terry 320 GSM", hsn="6001"),
            override("3-Thread Unbrushed Heavy Terry 360 GSM", hsn="6001"),
            override("3-Thread Brushed Fleece Cotton & CVC 280 GSM", hsn="6001"),
            override("3-Thread Brushed Fleece Cotton & CVC 300 GSM", hsn="6001"),
            override("3-Thread Brushed Fleece Cotton & CVC 320 GSM", hsn="6001"),
            override("3-Thread Brushed Fleece Cotton & CVC 350 GSM", hsn="6001"),
            override("3-Thread Brushed Fleece Cotton & CVC 400 GSM", hsn="6001"),
            "Waffle / Thermal Knit 220 GSM", "Waffle / Thermal Knit 260 GSM",
            "Pointelle / Eyelet Knit 170 GSM", "Jacquard Knit 220 GSM",
            override("Velour / Terry Towel Knit 240 GSM", hsn="6001"),
        ],
    },
    {
        "code": "FAB-MMF", "category": "FABRIC", "name": "MMF Knit & Activewear", "unit": "KG",
        "godown": "FABRIC-GODOWN", "stock_group": "SG-FAB-MMF", "hsn": "6006", "batch": True, "expiry": False,
        "items": [
            "100% Polyester Single Jersey Dry-Fit 135 GSM", "100% Polyester Single Jersey Dry-Fit 150 GSM",
            "100% Polyester Single Jersey Dry-Fit 165 GSM",
            "Polyester Birds-Eye / Pin-Dot / Honeycomb Mesh 140 GSM",
            "Polyester Birds-Eye / Pin-Dot / Honeycomb Mesh 160 GSM",
            "Polyester-Spandex 92/8 Activewear SJ 160 GSM", "Polyester-Spandex 92/8 Activewear SJ 180 GSM",
            "Polyester-Spandex 88/12 Brushed Peached Yoga Knit 220 GSM",
            "Polyester-Spandex 88/12 Brushed Peached Yoga Knit 250 GSM",
            "Recycled Polyester (rPET) Dry-Fit 150 GSM", "Recycled Polyester (rPET) Interlock 200 GSM",
            "Cationic Melange Polyester Knit 165 GSM", "Cationic Melange Polyester Knit 220 GSM",
            "Nylon-Spandex 80/20 Sportswear Knit 190 GSM", "Nylon-Spandex 82/18 Swimwear Knit 220 GSM",
            "Polyester Interlock 160 GSM", "Polyester Micro-Interlock 200 GSM",
            "Poly-Viscose-Elastane Knit 190 GSM",
            override("Warp-Knit Polyester Tricot Tracksuit 210 GSM", hsn="6002"),
            override("Poly-Cotton French Terry 260 GSM", hsn="6001"),
            override("Poly-Cotton Tech Fleece 300 GSM", hsn="6001"),
        ],
    },
    {
        "code": "FAB-CHINA", "category": "FABRIC", "name": "Imported China Fabric", "unit": "KG",
        "godown": "FABRIC-GODOWN", "stock_group": "SG-FAB-CHINA", "hsn": "6006", "batch": True, "expiry": False,
        "description": "Imported from China (bonded godown)",
        "items": [
            "China Scuba / Neoprene Knit 280 GSM", "China Scuba / Neoprene Knit 320 GSM",
            "China Ponte Roma Poly-Rayon-Spandex 260 GSM", "China Ponte Roma Poly-Rayon-Spandex 300 GSM",
            override("China Sherpa / Teddy Fleece 280 GSM", hsn="6001"),
            override("China Sherpa / Teddy Fleece 340 GSM", hsn="6001"),
            override("China Coral Fleece 260 GSM", hsn="6001"),
            override("China Polar & Anti-Pilling Micro Fleece 180 GSM", hsn="6001"),
            override("China Polar & Anti-Pilling Micro Fleece 240 GSM", hsn="6001"),
            override("China Polar & Anti-Pilling Micro Fleece 280 GSM", hsn="6001"),
            override("China Bonded Fleece / 3-Layer Waterproof Softshell 300 GSM", hsn="6001"),
            override("China Faux Fur / Hood Trim Fur 400 GSM", hsn="6001"),
            override("China Nylon Taslan 228T Water-Repellent 125 GSM", unit="YD", hsn="5407"),
            override("China 380T/400T Down-Proof Cire Nylon Taffeta (Puffer Shell) 60 GSM", unit="YD", hsn="5407"),
            override("China Polyester Pongee / Memory Fabric 115 GSM", unit="YD", hsn="5407"),
            override("China Polyester Pongee / Memory Fabric 140 GSM", unit="YD", hsn="5407"),
            override("China 4-Way Stretch Nylon-Spandex Woven 145 GSM", unit="YD", hsn="5407"),
            override("China TR Suiting Poly-Viscose-Spandex 220 GSM", unit="YD", hsn="5512"),
            override("China PU Faux Leather & Scuba Suede 260 GSM", unit="YD", hsn="5903"),
            override("China Satin / Charmeuse 95 GSM", unit="YD", hsn="5407"),
            override("China Georgette / Chiffon / Crepe 85 GSM", unit="YD", hsn="5407"),
            override("China Georgette / Chiffon / Crepe 110 GSM", unit="YD", hsn="5407"),
            override("China Velvet / Stretch Velour Poly-Spandex 240 GSM", unit="YD", hsn="5801"),
            override("China Stretch Lace / Power Mesh / Tulle 110 GSM", hsn="6002"),
            override("China Ultrasonic Quilted Padded Fabric 100g Polyfill", unit="YD", hsn="5407"),
            override("China Ultrasonic Quilted Padded Fabric 150g Polyfill", unit="YD", hsn="5407"),
        ],
    },
    {
        "code": "FAB-INTIMATE", "category": "FABRIC", "name": "Lingerie & Underwear Fabric", "unit": "KG",
        "godown": "FABRIC-GODOWN", "stock_group": "SG-FAB-INTIMATE", "hsn": "6004", "batch": True, "expiry": False,
        "description": "Bra, panty, boxer and brief fabric",
        "items": [
            "Nylon-Spandex Microfiber Jersey 80/20 160 GSM", "Nylon-Spandex Microfiber Jersey 85/15 180 GSM",
            "Power Net / Power Mesh Nylon-Spandex 78/22 160 GSM", "Power Net / Power Mesh Nylon-Spandex 78/22 210 GSM",
            override("Warp-Knit Nylon Tricot 110 GSM", hsn="6002"),
            override("Warp-Knit Nylon Tricot 140 GSM", hsn="6002"),
            override("Rigid Simplex 140 GSM", hsn="6002"),
            override("Nylon Marquisette 110 GSM", hsn="6002"),
            override("Stretch Raschel / Galloon Lace Fabric 120 GSM", hsn="6002"),
            override("Stretch Raschel / Galloon Lace Fabric 150 GSM", hsn="6002"),
            override("Laminated Bra PU Foam Sheet 3mm", unit="YD", hsn="3921"),
            override("Laminated Bra PU Foam Sheet 5mm", unit="YD", hsn="3921"),
            "Cotton-Elastane Gusset Jersey 95/5 150 GSM",
            "Cotton-Elastane Panty Jersey 95/5 160 GSM",
            "Cotton-Elastane Panty Jersey 95/5 170 GSM Bio-Polished",
            "Modal-Elastane Underwear Jersey 95/5 160 GSM", "Micro-Modal Underwear Jersey 95/5 180 GSM",
            "Bamboo-Elastane Underwear Jersey 95/5 170 GSM",
            "Poly-Spandex Breathable Micro-Mesh 150 GSM (Athletic Boxer)",
            "Fine-Gauge 1x1 Cotton-Elastane Brief Rib 180 GSM",
            override("Yarn-Dyed Woven Cotton Boxer Poplin 110 GSM", unit="YD", hsn="5208"),
            override("Yarn-Dyed Woven Cotton Boxer Check 110 GSM", unit="YD", hsn="5208"),
        ],
    },
    {
        "code": "FAB-DENIM", "category": "FABRIC", "name": "Denim Fabric", "unit": "YD",
        "godown": "FABRIC-GODOWN", "stock_group": "SG-FAB-DENIM", "hsn": "5209", "batch": True, "expiry": False,
        "items": [
            "100% Cotton Rigid Denim 10 oz", "100% Cotton Rigid Denim 11.5 oz", "100% Cotton Rigid Denim 12 oz",
            "100% Cotton Rigid Denim 13.5 oz", "100% Cotton Rigid Denim 14 oz",
            "Stretch Denim 98/2 9.5 oz", "Stretch Denim 98/2 10.5 oz", "Stretch Denim 98/2 11.5 oz", "Stretch Denim 98/2 12 oz",
            "Super-Stretch Jegging Denim 9 oz", "Super-Stretch Jegging Denim 10 oz",
            "Black Denim 11 oz", "Sulphur Denim 12 oz",
            "Knit-Look Indigo Terry Denim 10 oz",
        ],
    },
    {
        "code": "FAB-WOVEN", "category": "FABRIC", "name": "Woven Fabric", "unit": "YD",
        "godown": "FABRIC-GODOWN", "stock_group": "SG-FAB-WOVEN", "hsn": "5208", "batch": True, "expiry": False,
        "items": [
            "Cotton Twill Rigid 180 GSM", "Cotton Twill Stretch 200 GSM", "Cotton Twill Rigid 240 GSM", "Cotton Twill Stretch 280 GSM",
            "Cotton Canvas / Duck 10 oz", "Cotton Canvas / Duck 12 oz",
            "Cotton Poplin Solid 110 GSM", "Cotton Poplin Stretch 125 GSM",
            "Oxford Shirting 135 GSM", "Oxford Shirting 150 GSM",
            "Chambray 120 GSM", "Chambray 140 GSM",
            "Yarn-Dyed Brushed Flannel 150 GSM", "Yarn-Dyed Brushed Flannel 170 GSM",
            "Linen & Cotton-Linen Woven 145 GSM", "Linen & Cotton-Linen Woven 165 GSM",
            "Viscose / Rayon Challis 120 GSM",
            "Cotton Corduroy 11-wale 260 GSM", "Cotton Corduroy 14-wale 260 GSM",
            "Ripstop Workwear 210 GSM",
        ],
    },
    {
        "code": "FAB-LINING", "category": "FABRIC", "name": "Lining & Pocketing", "unit": "YD",
        "godown": "FABRIC-GODOWN", "stock_group": "SG-FAB-LINING", "hsn": "5407", "batch": True, "expiry": False,
        "items": [
            override("TC / Cotton Pocketing 105 GSM", hsn="5208"),
            override("TC / Cotton Pocketing 120 GSM", hsn="5208"),
            "Polyester Taffeta Lining 190T", "Polyester Taffeta Lining 210T",
            override("Brushed Tricot Lining", hsn="6002"),
            override("Mesh / Eyelet Lining 100 GSM", hsn="6002"),
            override("Mesh / Eyelet Lining 120 GSM", hsn="6002"),
        ],
    },
    # ----------------------------- TRIMS -----------------------------
    {
        "code": "TRM-ZIP", "category": "TRIM", "name": "Zippers", "unit": "PCS",
        "godown": "ACC-GODOWN", "stock_group": "SG-TRM-GENERAL", "hsn": "9607", "batch": False, "expiry": False,
        "items": [
            "Metal Auto-Lock Zipper #5", "Nylon Coil Zipper #3", "Nylon Coil Zipper #5",
            "Invisible Zipper #3", "Open-End Zipper #5",
        ],
    },
    {
        "code": "TRM-BTN", "category": "TRIM", "name": "Buttons & Metal Fasteners", "unit": "PCS",
        "godown": "ACC-GODOWN", "stock_group": "SG-TRM-GENERAL", "hsn": "9606", "batch": False, "expiry": False,
        "items": [
            "4-hole Plastic Button 15L", "4-hole Plastic Button 18L", "4-hole Plastic Button 20L",
            "Metal Shank Button 15mm", "Metal Shank Button 18mm",
            override("Snap Button (Prong) 10mm", hsn="8308"),
            override("Rivet 8mm", unit="GROSS", hsn="8308"),
        ],
    },
    {
        "code": "TRM-THR", "category": "TRIM", "name": "Sewing Thread", "unit": "CONE",
        "godown": "ACC-GODOWN", "stock_group": "SG-TRM-GENERAL", "hsn": "5401", "batch": False, "expiry": False,
        "items": [
            "Polyester Sewing Thread 40/2",
            "Core-Spun Sewing Thread 40/2",
            override("Cotton Sewing Thread 40/3", hsn="5204"),
        ],
    },
    {
        "code": "TRM-LBL", "category": "TRIM", "name": "Labels", "unit": "PCS",
        "godown": "ACC-GODOWN", "stock_group": "SG-TRM-GENERAL", "hsn": "5807", "batch": False, "expiry": False,
        "items": [
            "Main Woven Label", "Printed Neck Label", "Printed Care Label", "Size Label", "Country of Origin Label",
        ],
    },
    {
        "code": "TRM-ELS", "category": "TRIM", "name": "Elastics & Tapes", "unit": "ROLL",
        "godown": "ACC-GODOWN", "stock_group": "SG-TRM-GENERAL", "hsn": "5806", "batch": False, "expiry": False,
        "items": [
            "1-inch Waist Elastic", "Drawcord 6mm", "Twill Tape 3/8 inch", "Velcro Tape 1 inch",
        ],
    },
    {
        "code": "TRM-INT", "category": "TRIM", "name": "Interlining", "unit": "ROLL",
        "godown": "ACC-GODOWN", "stock_group": "SG-TRM-GENERAL", "hsn": "5903", "batch": False, "expiry": False,
        "items": [
            "Fusible Woven Interlining",
            override("Non-Woven Fusible Interlining", hsn="5603"),
            "Chest Piece Canvas Interlining",
        ],
    },
    {
        "code": "TRM-INTIMATE", "category": "TRIM", "name": "Lingerie & Underwear Trims", "unit": "PCS",
        "godown": "ACC-GODOWN", "stock_group": "SG-TRM-INTIMATE", "hsn": "6217", "batch": False, "expiry": False,
        "description": "Bra, panty, boxer and brief trims",
        "items": [
            override("Bra Hook & Eye Tape 2x3 Plush Back", unit="ROLL", hsn="5806"),
            override("Bra Hook & Eye Tape 3x3 Plush Back", unit="ROLL", hsn="5806"),
            override("Bra Hook & Eye Tape 3x4 Plush Back", unit="ROLL", hsn="5806"),
            "Bra Underwire Metal Coated",
            override("Bra Underwire Channelling / Casing Tape 10mm", unit="ROLL", hsn="5806"),
            override("Molded Bra Foam Cup / Push-Up Cup", unit="PAIR"),
            override("Bra Strap Plush Elastic 10mm", unit="ROLL", hsn="5806"),
            override("Bra Strap Plush Elastic 12mm", unit="ROLL", hsn="5806"),
            override("Bra Strap Plush Elastic 15mm", unit="ROLL", hsn="5806"),
            override("Bra Strap Plush Elastic 18mm", unit="ROLL", hsn="5806"),
            override("Bra Ring & Slider Nylon-Coated Metal 10mm", hsn="8308"),
            override("Bra Ring & Slider Nylon-Coated Metal 12mm", hsn="8308"),
            override("Bra Ring & Slider Nylon-Coated Metal 15mm", hsn="8308"),
            override("Bra Ring & Slider Nylon-Coated Metal 18mm", hsn="8308"),
            override("Front-Closure Bra Clasp / G-Hook", hsn="8308"),
            override("Flexible Plastic Side Boning 6mm", hsn="3926"),
            "Satin Center Decorative Bow",
            override("Picot / Scallop Plush Elastic 6mm", unit="ROLL", hsn="5806"),
            override("Picot / Scallop Plush Elastic 8mm", unit="ROLL", hsn="5806"),
            override("Picot / Scallop Plush Elastic 10mm", unit="ROLL", hsn="5806"),
            override("Fold-Over Elastic (FOE) 15mm", unit="ROLL", hsn="5806"),
            override("Fold-Over Elastic (FOE) 18mm", unit="ROLL", hsn="5806"),
            override("Silicone Gripper Elastic 10mm", unit="ROLL", hsn="5806"),
            override("Silicone Gripper Elastic 15mm", unit="ROLL", hsn="5806"),
            override("Stretch Galloon Lace Trim 15mm", unit="ROLL", hsn="5806"),
            override("Stretch Galloon Lace Trim 25mm", unit="ROLL", hsn="5806"),
            override("Stretch Galloon Lace Trim 40mm", unit="ROLL", hsn="5806"),
            override("Jacquard Logo Boxer Waistband Elastic 30mm", unit="ROLL", hsn="5806"),
            override("Jacquard Logo Boxer Waistband Elastic 35mm", unit="ROLL", hsn="5806"),
            override("Jacquard Logo Boxer Waistband Elastic 38mm", unit="ROLL", hsn="5806"),
            override("Jacquard Logo Boxer Waistband Elastic 40mm", unit="ROLL", hsn="5806"),
            override("Covered Insert Boxer Waist Elastic 25mm", unit="ROLL", hsn="5806"),
            override("Covered Insert Boxer Waist Elastic 32mm", unit="ROLL", hsn="5806"),
            override("Soft Plush Brief Waist Elastic 20mm", unit="ROLL", hsn="5806"),
            override("Soft Plush Brief Waist Elastic 25mm", unit="ROLL", hsn="5806"),
            override("Boxer Fly Button 14L", hsn="9606"),
            override("Boxer Fly Button 16L", hsn="9606"),
            override("Tagless Stretch Heat-Transfer Care / Brand Label", hsn="5807"),
            override("Woolly Nylon Looper Thread 150D/1", unit="CONE", hsn="5401"),
            override("Textured Polyester Looper Thread 150D/1", unit="CONE", hsn="5401"),
        ],
    },
    # ----------------------------- PACKING -----------------------------
    {
        "code": "PCK-POLY", "category": "PACK", "name": "Polybags", "unit": "PCS",
        "godown": "PACK-GODOWN", "stock_group": "SG-PACK", "hsn": "3923", "batch": False, "expiry": False,
        "items": [
            "Polybag 10x14 Clear Adhesive", "Polybag 12x16 Slider", "Polybag 14x20 Clear Adhesive",
        ],
    },
    {
        "code": "PCK-CTN", "category": "PACK", "name": "Cartons", "unit": "PCS",
        "godown": "PACK-GODOWN", "stock_group": "SG-PACK", "hsn": "4819", "batch": False, "expiry": False,
        "items": [
            "Carton 5-ply Export", "Carton 7-ply Export",
        ],
    },
    {
        "code": "PCK-AID", "category": "PACK", "name": "Tapes & Packing Aids", "unit": "PCS",
        "godown": "PACK-GODOWN", "stock_group": "SG-PACK", "hsn": "3926", "batch": False, "expiry": False,
        "items": [
            override("Gum Tape 2 inch Clear", unit="ROLL", hsn="3919"),
            override("Gum Tape 2.5 inch Brown", unit="ROLL", hsn="3919"),
            override("Stretch Film Roll", unit="ROLL", hsn="3920"),
            "Plastic Hanger",
            override("Tissue Paper", unit="KG", hsn="4802"),
            override("Silica Gel 2g Desiccant", hsn="2811"),
            override("Neck Board", hsn="4823"),
            "Collar Stay",
        ],
    },
    {
        "code": "PCK-TAG", "category": "PACK", "name": "Tags & Stickers", "unit": "PCS",
        "godown": "PACK-GODOWN", "stock_group": "SG-PACK", "hsn": "4821", "batch": False, "expiry": False,
        "items": [
            override("Barcode Sticker", unit="ROLL"),
            "Hangtag",
        ],
    },
    # ----------------------------- DYES & CHEMICALS -----------------------------
    {
        "code": "DYE-COL", "category": "DYE", "name": "Dyes", "unit": "KG",
        "godown": "CHEM-GODOWN", "stock_group": "SG-CHEM", "hsn": "3204", "batch": True, "expiry": True,
        "items": [
            "Reactive Dye Black", "Reactive Dye Navy", "Reactive Dye Red", "Disperse Dye",
        ],
    },
    {
        "code": "DYE-AUX", "category": "DYE", "name": "Dyeing Auxiliaries", "unit": "KG",
        "godown": "CHEM-GODOWN", "stock_group": "SG-CHEM", "hsn": "2815", "batch": True, "expiry": True,
        "items": [
            "Caustic Soda 98%",
            override("Soda Ash Light", hsn="2836"),
            override("Hydrogen Peroxide 50%", hsn="2847"),
            override("Acetic Acid 80%", unit="LTR", hsn="2915"),
            override("Glauber Salt", hsn="2833"),
            override("Common Salt (Sodium Chloride)", hsn="2501"),
            override("Sodium Hydrosulphite", hsn="2831"),
        ],
    },
    {
        "code": "DYE-FIN", "category": "DYE", "name": "Finishing & Washing Chemicals", "unit": "KG",
        "godown": "CHEM-GODOWN", "stock_group": "SG-CHEM", "hsn": "3402", "batch": True, "expiry": True,
        "items": [
            override("Cationic Softener", unit="LTR", hsn="3402"),
            override("Silicone Softener", unit="LTR", hsn="3910"),
            override("Cellulase Enzyme", hsn="3507"),
            override("Washing Pumice Stone", hsn="2513"),
            override("Potassium Permanganate", hsn="2841"),
        ],
    },
    # ----------------------------- SPARE PARTS -----------------------------
    {
        "code": "SPR-NDL", "category": "SPARE", "name": "Machine Needles", "unit": "PCS",
        "godown": "SPARE-GODOWN", "stock_group": "SG-SPARE", "hsn": "8452", "batch": False, "expiry": False,
        "items": [
            "Needle DBx1 #11", "Needle DBx1 #14", "Needle DCx27 #14", "Needle UYx128GAS",
        ],
    },
    {
        "code": "SPR-PRT", "category": "SPARE", "name": "Machine Parts", "unit": "PCS",
        "godown": "SPARE-GODOWN", "stock_group": "SG-SPARE", "hsn": "8452", "batch": False, "expiry": False,
        "items": [
            "Juki Bobbin", "Bobbin Case", "Rotary Hook", "Feed Dog", "Needle Plate",
            override("V-Belt", hsn="4010"),
            override("Timing Belt", hsn="4010"),
        ],
    },
    {
        "code": "SPR-OIL", "category": "SPARE", "name": "Machine Oil & Grease", "unit": "LTR",
        "godown": "SPARE-GODOWN", "stock_group": "SG-SPARE", "hsn": "2710", "batch": False, "expiry": False,
        "items": [
            "White Machine Oil",
            override("Machine Grease", unit="KG"),
        ],
    },
    # ----------------------------- FACTORY CONSUMABLES -----------------------------
    {
        "code": "CON-CUT", "category": "CONSUMABLE", "name": "Cutting & Pattern Consumables", "unit": "PCS",
        "godown": "ACC-GODOWN", "stock_group": "SG-CONSUMABLE", "hsn": "9609", "batch": False, "expiry": False,
        "items": [
            override("Tailor Chalk", unit="BOX"),
            override("Numbering Sticker Roll", unit="ROLL", hsn="4821"),
            override("Masking Tape", unit="ROLL", hsn="4811"),
            override("Fabric Scissor 10 inch", hsn="8213"),
            override("Measuring Tape", hsn="9017"),
            override("Pattern Paper Roll", unit="ROLL", hsn="4802"),
            override("Marker Paper Roll", unit="ROLL", hsn="4802"),
        ],
    },
    {
        "code": "CON-SEW", "category": "CONSUMABLE", "name": "Sewing & QC Consumables", "unit": "PCS",
        "godown": "ACC-GODOWN", "stock_group": "SG-CONSUMABLE", "hsn": "8213", "batch": False, "expiry": False,
        "items": [
            "Thread Trimmer (Nipper)",
        ],
    },
    {
        "code": "CON-PPE", "category": "CONSUMABLE", "name": "Safety & PPE", "unit": "PCS",
        "godown": "SPARE-GODOWN", "stock_group": "SG-CONSUMABLE", "hsn": "6307", "batch": False, "expiry": False,
        "items": [
            override("Safety Gloves (Cut Resistant)", unit="PAIR", hsn="6116"),
            override("Face Mask (Disposable)", unit="BOX"),
        ],
    },
    # ----------------------------- STATIONERY -----------------------------
    {
        "code": "STN-PAP", "category": "STATIONERY", "name": "Paper & Books", "unit": "PKT",
        "godown": "OFF-STATIONERY-GODOWN", "stock_group": "SG-STATIONERY", "hsn": "4802", "batch": False, "expiry": False,
        "items": [
            "A4 Paper 80 GSM (500 sheets)",
            override("Register Book 500 pages", unit="PCS", hsn="4820"),
            override("Sticky Notes", hsn="4820"),
        ],
    },
    {
        "code": "STN-DSK", "category": "STATIONERY", "name": "Writing & Desk Supplies", "unit": "PCS",
        "godown": "OFF-STATIONERY-GODOWN", "stock_group": "SG-STATIONERY", "hsn": "9608", "batch": False, "expiry": False,
        "items": [
            "Ballpoint Pen Black", "Ballpoint Pen Blue", "Ballpoint Pen Red",
            "Highlighter Pen", "Whiteboard Marker",
            override("Stapler Machine", hsn="8472"),
            override("Stapler Pin 24/6", unit="BOX", hsn="7317"),
            override("Punch Machine", hsn="8472"),
            override("Calculator 12-Digit", hsn="8470"),
            override("Glue Stick", hsn="3506"),
        ],
    },
    {
        "code": "STN-FIL", "category": "STATIONERY", "name": "Filing Supplies", "unit": "PCS",
        "godown": "OFF-STATIONERY-GODOWN", "stock_group": "SG-STATIONERY", "hsn": "4820", "batch": False, "expiry": False,
        "items": [
            "Box File",
            override("Paper Clip", unit="PKT", hsn="8305"),
        ],
    },
    {
        "code": "STN-IT", "category": "STATIONERY", "name": "Printer & IT Supplies", "unit": "PCS",
        "godown": "OFF-STATIONERY-GODOWN", "stock_group": "SG-STATIONERY", "hsn": "8443", "batch": False, "expiry": False,
        "items": [
            "Printer Toner Cartridge",
            "Printer Ink Cartridge",
        ],
    },
]
