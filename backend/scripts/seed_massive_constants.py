"""RMG lexicon and templates for seed_massive_data.py (keeps main script readable)."""

# Prefix for all codes created by the massive seed (tenant-scoped uniqueness).
CODE_PREFIX = "MG-RMG"

# Garment product words (style names / descriptions).
GARMENT_TYPES = (
    "Pullover Hoodie",
    "Crew Neck Tee",
    "Polo Shirt",
    "Chino Short",
    "Denim Jacket",
    "Bomber Jacket",
    "Cargo Pant",
    "Legging",
    "Tank Top",
    "Long Sleeve Tee",
    "Fleece Zip Hoodie",
    "Softshell Jacket",
    "Rain Jacket",
    "Dress Shirt",
    "Blouse",
    "Skirt",
    "Jogger",
    "Sweatshirt",
    "Cardigan",
    "Parka",
)

FABRIC_DESCRIPTORS = (
    "Single Jersey 160gsm",
    "Fleece 280gsm",
    "Twill 240gsm",
    "Poplin 110gsm",
    "Denim 12oz",
    "Interlock 200gsm",
    "Rib 1x1",
    "Mesh 125gsm",
    "Canvas 10oz",
    "French Terry 300gsm",
)

SEASONS = ("SS25", "FW25", "SS26", "FW26", "RESORT26")
DEPARTMENTS = ("Mens", "Womens", "Kids", "Unisex")
SHIPPING_TERMS = ("FOB Chittagong", "CIF Hamburg", "EXW Dhaka", "FCA Dhaka", "DDP London")

# Inquiry / order status pools
INQUIRY_STATUSES_WEIGHTED = (
    ("DRAFT", 0.12),
    ("LOST", 0.08),
    ("PENDING_REVIEW", 0.10),
    ("QUOTED", 0.25),
    ("WON", 0.35),
    ("CLOSED", 0.10),
)

QUOTATION_STATUSES = ("DRAFT", "SENT", "ACCEPTED", "EXPIRED", "REVISED")
ORDER_STATUSES = ("DRAFT", "CONFIRMED", "IN_PRODUCTION", "SHIPPED", "PARTIALLY_SHIPPED", "CLOSED")

# Item category seeds (code, name, description)
ITEM_CATEGORY_SEEDS = [
    ("MG-FAB", "Fabric", "Woven and knitted fabrics for RMG"),
    ("MG-TRIM", "Trims", "Zippers, buttons, labels, thread"),
    ("MG-PACK", "Packaging", "Polybags, cartons, hangers"),
    ("MG-THREAD", "Thread", "Sewing thread and overlock"),
    ("MG-CHEM", "Chemicals", "Dyes, softeners, auxiliaries"),
    ("MG-FIN", "Finishing", "Finishing consumables"),
    ("MG-ACC", "Accessories", "Hang tags, stickers, security tags"),
    ("MG-YARN", "Yarn", "Knitting and weaving yarn"),
    ("MG-ELAS", "Elastic", "Waistband and narrow elastic"),
    ("MG-INT", "Interlining", "Fusible and sew-in interlinings"),
    ("MG-SEMI", "Semi-Finished", "Cut panels and bundles"),
    ("MG-FG", "Finished Goods", "Packed finished garments"),
]

ITEM_SUBCATEGORY_SEEDS = [
    ("MG-FAB", "MG-FAB-JER", "Jersey knits"),
    ("MG-FAB", "MG-FAB-FLEE", "Fleece and brushed"),
    ("MG-FAB", "MG-FAB-WOV", "Woven shirting and bottomweight"),
    ("MG-TRIM", "MG-TRIM-ZIP", "Zippers and pulls"),
    ("MG-TRIM", "MG-TRIM-BTN", "Buttons and snaps"),
    ("MG-TRIM", "MG-TRIM-LBL", "Labels and patches"),
    ("MG-PACK", "MG-PACK-PB", "Polybags and OPP"),
    ("MG-PACK", "MG-PACK-CTN", "Corrugated cartons"),
    ("MG-THREAD", "MG-THR-POLY", "Poly core thread"),
    ("MG-CHEM", "MG-CHM-DYE", "Reactive and disperse dyes"),
]

UNIT_SEEDS = [
    ("KG", "Kilogram"),
    ("YDS", "Yards"),
    ("M", "Metre"),
    ("PCS", "Pieces"),
    ("DZ", "Dozen"),
    ("CONE", "Cone"),
    ("ROLL", "Roll"),
    ("GROSS", "Gross"),
    ("BOX", "Box"),
    ("SET", "Set"),
    ("PAIR", "Pair"),
    ("L", "Litre"),
]

WAREHOUSE_SEEDS = [
    ("MG-WH-RM", "Raw Material Main", "Block A — greige and trims"),
    ("MG-WH-FAB", "Fabric Store", "Roll storage climate controlled"),
    ("MG-WH-TRIM", "Trim Store", "Small parts and labels"),
    ("MG-WH-FG", "Finished Goods", "Pre-shipment FG"),
    ("MG-WH-QC", "QC Hold", "Inspection hold"),
    ("MG-WH-SCRAP", "Scrap and Waste", "End bits and rejects"),
    ("MG-WH-TRANS", "Transit", "Port and 3PL staging"),
    ("MG-WH-SAMP", "Sampling", "Development sampling stock"),
]

STOCK_GROUP_ROOTS = [
    ("MG-SG-FAB", "Fabric Stock"),
    ("MG-SG-TRIM", "Trims Stock"),
    ("MG-SG-FG", "Finished Goods Stock"),
]

STOCK_GROUP_CHILDREN = [
    ("MG-SG-FAB-COT", "Cotton Fabric", "MG-SG-FAB"),
    ("MG-SG-FAB-SYN", "Synthetic Fabric", "MG-SG-FAB"),
    ("MG-SG-TRIM-GEN", "General Trims", "MG-SG-TRIM"),
    ("MG-SG-FG-PACK", "Packed Garments", "MG-SG-FG"),
]

# Synthetic item name templates: (category_code, sub_code or None, unit_code, name_fmt)
ITEM_NAME_TEMPLATES = [
    ("MG-FAB", "MG-FAB-JER", "KG", "{fabric} — {color} — lot {lot}"),
    ("MG-FAB", "MG-FAB-FLEE", "KG", "{fabric} — brushed — {color}"),
    ("MG-TRIM", "MG-TRIM-ZIP", "PCS", "Zipper {size} — {metal} — {color}"),
    ("MG-TRIM", "MG-TRIM-BTN", "GROSS", "Button {dia}mm — four-hole — {finish}"),
    ("MG-TRIM", "MG-TRIM-LBL", "PCS", "Woven main label — {buyer} — {season}"),
    ("MG-PACK", "MG-PACK-PB", "PCS", "Polybag {width}x{height} — {mu} micron"),
    ("MG-PACK", "MG-PACK-CTN", "PCS", "Carton {ply}-ply — {size}"),
    ("MG-THREAD", "MG-THR-POLY", "CONE", "Thread {tex} — {color} — {cone}"),
    ("MG-CHEM", "MG-CHM-DYE", "KG", "Dye {shade} — {class_} — batch {batch}"),
    ("MG-ELAS", None, "M", "Elastic {width}mm — braided — {color}"),
    ("MG-INT", None, "M", "Fusible interlining — {weight}gsm — {width}cm"),
    ("MG-YARN", None, "KG", "Yarn Ne{ne} — {fiber} — {color}"),
]
