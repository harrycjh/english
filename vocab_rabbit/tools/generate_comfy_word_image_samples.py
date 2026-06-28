#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import shutil
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont


PROJECT_ROOT = Path(__file__).resolve().parents[1]
WORD_LIST_PATH = PROJECT_ROOT / "public/content/words/ket_vocabulary.json"
WORKFLOW_TEMPLATE_PATH = Path(
    "/Users/chujianhe/Documents/Codex/2026-06-22/w/outputs/comfyui-recovered-workflows/z-image-turbo_00001_.api-prompt.json"
)
COMFY_OUTPUT_ROOT = Path("/Users/chujianhe/ComfyUI-Shared/output")
DEFAULT_OUTPUT_ROOT = PROJECT_ROOT / "design-output/word-image-generation"

FAMILY_SCENES = {
    "ket_aunt_n": "an adult woman smiling beside her niece and nephew at a family picnic",
    "ket_girl_n": "one cheerful school-age girl standing outdoors",
    "ket_group_n": "a small group of five diverse children standing together",
    "ket_mum_n_br_eng": "a mother hugging her child in a cozy home",
    "ket_boy_n": "one cheerful school-age boy standing outdoors",
    "ket_grandchild_n": "a young child happily sitting between two grandparents",
    "ket_guest_n": "a friendly visitor being welcomed through the front door of a home",
    "ket_neighbour_n": "two families greeting each other across the low fence between their homes",
    "ket_brother_n": "two boys of different ages standing together as brothers",
    "ket_grand_d_ad_n": "a kind elderly grandfather walking hand in hand with his grandchild",
    "ket_guy_n": "one friendly young adult man in casual clothes",
    "ket_parent_n": "one caring parent holding a young child's hand",
    "ket_child_n": "one happy young child playing with wooden blocks",
    "ket_granddaughter_n": "a young girl hugging her grandmother",
    "ket_husband_n": "a married adult man standing affectionately beside his wife",
    "ket_penfriend_n": "two children in different homes exchanging plain sealed envelopes through mailboxes",
    "ket_cousin_n": "two children from an extended family playing together at a family picnic",
    "ket_grandfather_n": "a kind elderly grandfather reading a picture book with his grandchild, all pages blank",
    "ket_love_n_v": "a parent and child sharing a warm affectionate hug, with a small simple heart shape nearby",
    "ket_sister_n": "two girls of different ages standing together as sisters",
    "ket_dad_n": "a father hugging his child in a cozy home",
    "ket_grandma_n": "a kind elderly grandmother baking with her grandchild in a cozy kitchen",
    "ket_married_adj": "a happy married couple wearing plain wedding rings and holding hands",
    "ket_son_n": "a father and mother proudly standing beside their young son",
    "ket_daughter_n": "a father and mother proudly standing beside their young daughter",
    "ket_grandmother_n": "a kind elderly grandmother reading a picture book with her grandchild, all pages blank",
    "ket_miss_n": "a friendly unmarried woman teacher being politely greeted by two schoolchildren outdoors",
    "ket_miss_v": "a child arriving too late with a school bus pulling away in the distance",
    "ket_surname_n": "three generations of one family posing together for a family portrait",
    "ket_family_n": "a happy family of two parents and two children together at home",
    "ket_grandpa_n": "a kind elderly grandfather gardening with his grandchild",
    "ket_mother_n": "a mother caring for her young child at home",
    "ket_teenager_n": "one cheerful teenage student wearing a backpack outdoors",
    "ket_father_n": "a father caring for his young child at home",
    "ket_grandparent_n": "a grandmother and grandfather together with one grandchild",
    "ket_mr_n": "a polite adult man in everyday clothes being greeted by two schoolchildren outdoors",
    "ket_uncle_n": "an adult man smiling beside his niece and nephew at a family picnic",
    "ket_friend_n": "two children smiling and playing together as close friends",
    "ket_grandson_n": "a young boy hugging his grandfather",
    "ket_mrs_n": "a married adult woman wearing a plain wedding ring and greeting two neighbours",
    "ket_wife_n": "a married adult woman standing affectionately beside her husband",
    "ket_friendly_adj": "a smiling child warmly welcoming a new child into a playground game",
    "ket_granny_n": "a kind elderly grandmother knitting beside her grandchild",
    "ket_ms_n": "a confident adult woman being politely greeted by two coworkers",
    "ket_kid_s_n": "three happy young children playing together with a ball outdoors",
}

COLOR_SCENES = {
    "ket_black_adj_n": "three clearly black objects on a light background: a hat, an umbrella, and a pair of boots",
    "ket_golden_adj": "three shiny golden objects on a light background: a star, a ribbon, and a small bell",
    "ket_orange_adj_n": "three clearly orange-colored objects on a light background: a balloon, a scarf, and a cup, with no fruit",
    "ket_red_adj": "three clearly red objects on a light background: a balloon, an apple, and a toy car",
    "ket_blue_adj_n": "three clearly blue objects on a light background: a balloon, a cup, and a toy boat",
    "ket_green_adj": "three clearly green objects on a light background: a leaf, a ball, and a rain boot",
    "ket_pale_adj": "a washed-out pale pink scarf beside an otherwise identical vivid deep pink scarf, with the pale scarf larger and emphasized",
    "ket_silver_n_adj": "three shiny silver-colored objects on a light background: a spoon, a bracelet, and a small bell",
    "ket_brown_adj_n": "three clearly brown objects on a light background: a teddy bear, a boot, and a wooden bowl",
    "ket_pink_adj": "three clearly pink objects on a light background: a balloon, a flower, and a rain boot",
    "ket_white_adj": "three clearly white objects on a blue background: a feather, a snowball, and a cloud-shaped cushion",
    "ket_dark_adj": "two blue umbrellas side by side, one light blue and one very dark blue, with the dark umbrella larger and emphasized",
    "ket_purple_adj": "three clearly purple objects on a light background: a balloon, a flower, and a cup",
    "ket_yellow_adj": "three clearly yellow objects on a light background: a balloon, a rain boot, and a toy car",
}

WEATHER_SCENES = {
    "ket_cloud_n": "one large soft white cloud floating in a clear blue sky",
    "ket_sun_n": "a large bright sun shining alone in a clear sky above a green field",
    "ket_wet_adj": "a red raincoat and pair of rain boots dripping with water beside a shiny puddle",
    "ket_cloudy_adj": "a town under a sky completely covered with many grey clouds",
    "ket_sunny_adj": "children playing in a bright park under strong warm sunshine and a clear blue sky",
    "ket_wind_n": "a strong gust of wind visibly blowing leaves, a scarf, and tree branches sideways",
    "ket_rain_n_v": "heavy raindrops falling from a dark cloud onto an open umbrella and puddles",
    "ket_thunderstorm_n": "dark storm clouds with bright lightning and heavy rain over a distant town",
    "ket_windy_adj": "a child holding a hat while strong wind bends a tree and blows leaves sideways",
    "ket_fog_n": "thick white fog covering a quiet road and partly hiding distant trees",
    "ket_snow_n_v": "large snowflakes falling over a small house and snow-covered trees",
    "ket_warm_adj": "a comfortable child enjoying gentle sunshine in a light sweater on a mild spring day",
    "ket_foggy_adj": "a person walking carefully through a town street filled with thick pale fog",
    "ket_storm_n": "powerful dark clouds, strong wind, and heavy rain bending trees in an open landscape",
    "ket_weather_n": "one broad landscape under a changing sky containing sunshine, clouds, rain, wind, and snow",
}

ELECTRONICS_SCENES = {
    "ket_camera_n": "one simple modern camera with a large lens on a plain surface, no brand or writing",
    "ket_laptop_computer_n": "one open laptop computer with a completely blank blue screen on a desk",
    "ket_radio_n": "one small portable radio with a speaker, antenna, and plain knobs, no labels or numbers",
    "ket_cd_player_n": "a compact disc player playing a shiny blank disc, with small music notes nearby",
    "ket_electric_adj": "a desk lamp connected by a visible cable to a wall outlet and glowing brightly",
    "ket_telephone_n_v": "one classic landline telephone with a handset and plain buttons, no numbers",
    "ket_cell_phone_n": "one modern cell phone with a completely blank screen on a plain surface",
    "ket_electricity_n": "a small battery safely connected to a glowing light bulb by two visible wires",
    "ket_mobile_phone_n": "one modern mobile phone held in a hand, with a completely blank screen",
    "ket_television_tv_n": "one television showing a simple nature picture with no words, logos, or interface",
    "ket_video_n": "a small video camera filming a bouncing ball, beside three simple sequential picture frames with no text",
    "ket_pc_personal_computer_n": "a desktop personal computer with monitor, keyboard, and mouse, all surfaces blank",
    "ket_washing_machine_n": "one front-loading washing machine with colorful clothes visible inside, no labels",
    "ket_phone_v_n": "a child happily talking to a friend on a plain telephone, with no screen text",
    "ket_digital_camera_n": "one compact digital camera with a large lens and completely blank rear screen",
    "ket_battery_n": "two plain household batteries beside a small glowing flashlight, with no labels or symbols",
    "ket_cd_n": "one shiny blank compact disc beside headphones and floating music notes",
    "ket_dvd_n": "one shiny blank video disc beside a plain film reel, a small media player, and a bowl of popcorn",
    "ket_equipment_n": "a neatly arranged set of useful equipment: camera, tripod, headphones, lamp, and small toolkit",
}

IDENTITY_SCENES = {
    "ket_boyfriend_n": "a wholesome teenage boy and girl walking together affectionately in a sunny park",
    "ket_business_person_n": "one professional adult in business clothes carrying a briefcase in a modern office lobby",
    "ket_celebrity_n": "a famous friendly performer waving to an excited crowd, with cameras but no banners or writing",
    "ket_colleague_n": "two adult coworkers happily working together at neighboring desks with blank screens and papers",
    "ket_first_name_n": "two children meeting for the first time and politely pointing to themselves while smiling",
    "ket_girlfriend_n": "a wholesome teenage girl and boy walking together affectionately in a sunny park",
    "ket_headteacher_n": "a school principal welcoming children at the entrance of a school with blank walls",
    "ket_housewife_n": "an adult woman managing a home, folding clean laundry beside a basket in a cozy room",
    "ket_man_n": "one friendly adult man standing outdoors in simple everyday clothes",
    "ket_name_n": "two children greeting each other and pointing to themselves as they introduce who they are",
    "ket_nationality_n": "a diverse group of people from different countries standing together with plain colorful flags and no symbols",
}

CALENDAR_SCENES = {
    "ket_april_n": "a child walking under an umbrella through gentle spring rain and fresh green buds, no writing",
    "ket_august_n": "a very hot late-summer beach day with bright sun, swimming, and watermelon, no writing",
    "ket_december_n": "a snowy winter evening with a decorated evergreen tree and warm lights, no writing",
    "ket_february_n": "a cozy winter scene with snow, warm clothes, and simple heart decorations, no writing",
    "ket_friday_n": "schoolchildren happily leaving school at the end of the school week, no writing",
    "ket_january_n": "a fresh snowy winter morning with a child building a snowman, no writing",
    "ket_july_n": "a bright midsummer day with children swimming and playing on a beach, no writing",
    "ket_june_n": "an early-summer picnic in a sunny green park full of flowers, no writing",
    "ket_march_n": "the first spring buds opening as the last small patches of snow melt, no writing",
    "ket_may_n": "a warm spring garden overflowing with colorful flowers and butterflies, no writing",
    "ket_monday_n": "a child starting the school week by arriving at school with a backpack, no writing",
    "ket_november_n": "a cool late-autumn day with bare trees, a warm coat, and fallen leaves, no writing",
    "ket_october_n": "an autumn scene with orange leaves, pumpkins, and children in light jackets, no writing",
    "ket_saturday_n": "a family enjoying a relaxed daytime outing together in a park, no writing",
    "ket_september_n": "children returning to school in early autumn with backpacks and falling leaves, no writing",
    "ket_sunday_n": "a family enjoying a slow relaxing breakfast together at home, no writing",
    "ket_thursday_n": "schoolchildren doing a music activity near the end of the school week, no writing",
    "ket_tuesday_n": "schoolchildren doing an art activity on the second school day, no writing or numbers",
    "ket_wednesday_n": "schoolchildren enjoying a midweek sports activity in the school playground, no writing",
}

NUMBER_SCENES = {
    "ket_first_adv_adj": "one runner crossing the finish line clearly ahead of two runners behind, no written numbers",
    "ket_one_det_pron": "one single red apple alone in the center of a plain table, no written numbers",
    "ket_zero_n": "an open empty basket with nothing inside, clearly showing none remaining, no written numbers",
}

NATURAL_PLACE_SCENES = {
    "ket_area_n": "a broad outdoor area containing a meadow, a few trees, and a small pond viewed from above",
    "ket_forest_n": "a dense green forest filled with many tall trees and a narrow natural trail",
    "ket_ocean_n": "a vast blue ocean stretching to the horizon with gentle waves",
    "ket_hill_n": "one rounded green hill rising clearly above a flat meadow",
    "ket_path_n": "a narrow winding footpath leading through grass and trees",
    "ket_sky_n": "a wide bright blue sky with a few soft white clouds above a low horizon",
    "ket_island_n": "one small tropical island surrounded completely by blue sea",
    "ket_village_n": "a small country village with a few houses, trees, and a quiet lane",
    "ket_farm_n": "a countryside farm with a barn, crop field, tractor, and a few animals",
    "ket_lake_n": "a calm blue lake surrounded by green hills and trees",
    "ket_rainforest_n": "a lush tropical rainforest with dense broad leaves, vines, and tall trees",
    "ket_wood_n": "a small woodland made of many trees with a walking trail between them",
    "ket_field_n": "a wide open green field bordered by a simple fence and distant trees",
    "ket_mountain_n": "one tall rocky mountain with a snow-covered peak above a valley",
    "ket_river_n": "a flowing blue river winding through green countryside",
    "ket_coast_n": "a clear coastline where rocky green land meets the blue sea",
}

CATEGORY_CONTEXTS = {
    "动物和昆虫": "animals and insects",
    "颜色": "colors and shades",
    "食物和饮料": "food and drinks",
    "房子和家具": "homes and furniture",
    "衣服和配饰": "clothing and accessories",
    "身体、健康和锻炼": "the human body, health, and exercise",
    "运动和比赛": "sports and games",
    "出行和交通": "travel and transport",
    "自然世界": "the natural world",
    "天气": "weather",
    "玩具、礼物和小物件": "toys, gifts, and small objects",
    "家用电器和电子设备": "home appliances and electronic devices",
    "建筑和公共地点": "buildings and public places",
    "城镇街道和城市": "towns, streets, and cities",
    "乡村和自然地点": "the countryside and natural places",
    "工作和职业": "jobs and occupations",
    "人物身份和称呼": "people, identities, and forms of address",
    "家人和朋友": "family and friends",
    "学校和学习": "school and learning",
    "娱乐和表演": "entertainment and performance",
    "爱好和休闲": "hobbies and leisure",
    "购物买东西": "shopping and buying things",
    "通讯、网络和数码": "communication, the internet, and digital technology",
    "书本、证件和文字": "books, documents, and writing",
    "月份和星期": "months and days of the week",
    "时间和日期": "time and dates",
    "常用动作动词": "common physical actions",
    "说话和思考动词": "speaking and thinking actions",
    "常用短语动词": "common phrasal actions",
    "常见形容词": "common descriptive qualities",
    "感受和性格": "feelings and personality",
    "方式和程度副词": "ways and degrees of doing things",
    "时间和频率副词": "time and frequency",
    "介词和方向词": "positions and directions",
    "人称和指代词": "people and reference words",
    "冠词和限定词": "quantity and reference",
    "连词和句子连接词": "choices, causes, and connected events",
    "情态动词和语气": "ability, permission, obligation, and possibility",
    "感叹词和回应语": "greetings, reactions, and responses",
    "数量和多少": "quantities and amounts",
    "数字和顺序词": "numbers and order",
    "抽象概念和想法": "ideas and abstract concepts",
    "其他常用词": "everyday situations",
}


def post_json(url: str, payload: dict[str, Any]) -> dict[str, Any]:
    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def get_json(url: str) -> dict[str, Any]:
    with urllib.request.urlopen(url, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def load_words(include_approved: bool) -> list[dict[str, Any]]:
    payload = json.loads(WORD_LIST_PATH.read_text(encoding="utf-8"))
    return [
        word
        for word in payload["words"]
        if word.get("imagePath") and (include_approved or word.get("imageApproved") is not True)
    ]


def build_prompt(word: dict[str, Any]) -> str:
    english = word["english"]
    scene_hints = {
        "grandchild": "a young child happily spending time with an elderly grandmother and grandfather in a sunny park",
        "guest": "a friendly visitor being welcomed at the front door of a cozy home",
        "penfriend": "two children smiling while exchanging plain sealed envelopes near two mailboxes, with no visible writing surfaces",
        "grandma": "a kind elderly woman smiling warmly in a cozy home",
        "surname": "a smiling family standing together for a simple outdoor portrait, suggesting a family group with no signs or writing anywhere",
        "grandpa": "a kind elderly man smiling warmly in a cozy home",
        "teenager": "a cheerful teenage student with a backpack standing outdoors",
        "granny": "a kind elderly woman smiling warmly in a cozy home",
        "boyfriend": "a friendly teenage boy and girl walking together in a park, wholesome and age appropriate",
        "business person": "a professional adult in business clothes carrying a briefcase in a modern office lobby",
        "first name": "a smiling child being gently greeted by a teacher in a classroom, with all papers and boards completely blank",
        "nationality": "children from different countries standing together with colorful blank flags and no symbols",
        "dictionary": "a thick closed reference book beside a magnifying glass and blank pages, with no visible writing",
        "chemistry": "safe colorful laboratory bottles and beakers on a clean table, with no labels or writing",
        "blog": "a child sitting at a laptop with a camera and notebook nearby, sharing a story online, with a completely blank screen",
        "discount": "a happy shopper holding a shopping bag beside two toys and a small pile of coins, with no price tags or signs",
        "February": "a cozy winter scene with snow, warm clothes, and heart decorations, with no calendar or writing",
        "turn on": "a child pressing a plain light switch as a lamp starts glowing, with no words or symbols",
        "half-price": "a shopper choosing between two identical toys, one next to a smaller pile of coins, with no signs or numbers",
        "well known": "a friendly performer on a small stage waving to a happy crowd, with no banners or writing",
        "celebrity": "a famous friendly performer waving to a crowd of smiling fans, with no banners or writing",
        "colleague": "two adults working together at neighboring desks in an office, with blank papers only",
        "headteacher": "a school principal welcoming children at a classroom door, with blank walls and no writing",
        "housewife": "an adult at home folding laundry beside a basket in a cozy room",
        "stomach ache": "a child gently holding their belly while sitting on a sofa, with a caring adult nearby",
        "pleasant": "a calm sunny garden picnic scene with smiling children and flowers",
        "accommodation": "a cozy bedroom in a small guest room with a made bed and suitcase",
        "DVD": "a shiny blank disc beside a small media player, with no letters on the disc",
        "roast": "a roasted meal on a plate with steam rising, no text",
        "main course": "a full dinner plate with vegetables and a central warm dish, no menu or writing",
        "slice": "one clean slice cut from a round fruit on a plate",
        "fried": "golden food cooking in a pan with a little oil and steam",
        "ingredient": "several simple cooking items on a kitchen table, such as eggs, flour, vegetables, and oil, with no labels",
        "biology": "a child observing a leaf and small plant through a magnifying glass, with blank notebook pages",
        "diploma": "a student in graduation clothes holding a rolled blank certificate tied with a ribbon",
        "geography": "children looking at a globe and mountains model, with no map labels or writing",
        "physics": "a simple science table with magnets, balls, and a ramp, with no formulas or writing",
        "grade": "a teacher placing a star sticker on a completely blank paper while a student smiles",
        "vocabulary": "children matching picture cards with blank cards on a table, no letters or words",
        "article": "a person reading a blank newspaper-style page at a table, no visible text",
        "paragraph": "several blank paper strips arranged neatly on a desk with a pencil nearby",
        "review": "a child thoughtfully looking at a toy and giving a thumbs-up, no rating stars with text",
        "hip hop": "a dancer in a colorful outfit doing a street dance pose on a clean stage, no graffiti or signs",
        "classical": "a small orchestra scene with violin and piano in a concert room, no posters",
        "comedy": "a cheerful performer making children laugh on a small stage, no microphone label or signs",
        "hobby": "a child choosing between painting, music, and a toy model at a table, no labels",
        "software": "a clean computer screen showing simple colorful shapes and buttons without any text",
        "by post": "a person putting a plain envelope into a red mailbox with no writing",
        "download": "a simple arrow shape moving from a cloud icon into a laptop, with no letters or numbers",
        "online": "two children smiling at each other through two blank computer screens connected by glowing dots",
        "password": "a key beside a locked tablet with a blank screen, no symbols or numbers",
        "web page": "a laptop showing a blank colorful layout with boxes and pictures, no writing",
        "app": "a tablet showing simple colorful rounded squares with no letters or icons",
        "channel": "a child choosing between several blank video thumbnails on a screen, no writing",
        "chatroom": "children chatting through blank speech bubbles on tablets, no written text",
        "social media": "friends sharing photos on phones shown as blank picture squares, no logos or writing",
        "technology": "a friendly desk with a laptop, tablet, headphones, and small robot toy, all screens blank",
        "wifi": "a family using devices near a router with soft signal waves, no symbols or letters",
        "department store": "a large indoor shop with clothing racks, toys, and shoppers, no signs or labels",
        "pharmacy": "a clean medicine shop counter with bottles and a friendly worker, all labels blank",
        "grocery store (n)": "a small food shop with fruit baskets and shelves, no signs or labels",
        "post office": "a counter with parcels and envelopes being handed over, no signs or writing",
        "guest-house": "a cozy small house with suitcases near the door, no signboard",
        "petrol station": "a car beside a fuel pump with all signs and numbers blank",
        "city centre": "a busy town square with buildings, trees, and people walking, no shop signs",
        "roundabout": "a circular road with small cars going around a planted island, no road signs",
        "crossing": "children safely walking across a zebra crossing with no street signs",
        "shop assistant": "a friendly store worker helping a child choose a toy at a counter, no labels",
        "shopper": "a child carrying shopping bags in a clean store aisle, no signs",
        "customer": "a person politely paying at a shop counter with coins, no receipt text",
        "dollar": "green coins and bills represented as plain money shapes without symbols or numbers",
        "September": "children walking to school in early autumn with orange leaves, no calendar",
        "weekday": "a child going to school in the morning with backpack and lunchbox, no calendar",
        "weekly": "a child doing the same small chore in several simple repeated picture panels, no labels",
        "working hours": "a shop worker opening a store in the morning and leaving in the evening, no clock numbers or signs",
        "monthly": "a plant growing through four simple moon phases, no calendar or writing",
        "centimetre/centimeter (cm)": "a small toy car being measured with a plain ruler that has no numbers",
        "degree": "a thermometer beside a sunny window, with no numbers or scale marks",
        "petrol": "a red fuel can beside a small car, with no labels",
        "tour guide": "a friendly guide leading a small group through a scenic place, with no flag symbols or signs",
        "tourist information centre": "a helpful desk where a traveler asks for directions, with blank maps and no signs",
        "mechanic": "a mechanic fixing a small red car with tools in a clean garage",
        "sightseeing": "a family happily looking at a famous-looking landmark from a viewpoint, no signs",
        "journalist": "a reporter holding a microphone and camera in front of a scene, no logos or writing",
        "secretary": "an office worker organizing blank papers at a desk with a computer",
        "businessman": "an adult man in business clothes carrying a briefcase in an office lobby",
        "businesswoman": "an adult woman in business clothes carrying a folder in an office lobby",
        "occupation": "several adults in different work outfits standing together, no labels",
        "guide": "a friendly person leading children along a forest path, no signs",
        "receptionist": "a friendly person at a front desk greeting a visitor, no signs or forms with writing",
        "career": "a student looking at several adults in different work outfits, no labels",
        "department": "different office teams working in separate open rooms, no signs",
        "identification": "a person showing a blank card with a simple portrait shape, no text or numbers",
        "opinion": "two children looking at the same painting and showing different facial expressions",
        "topic": "a group of children sitting around one object in the middle and discussing it, no words",
        "minus": "a child removing one apple from a small group of apples on a table, no symbols",
        "or": "a child choosing between an apple and a banana, no symbols or words",
        "alright": "a smiling child giving a thumbs-up after a small accident is fixed",
        "good afternoon": "two people greeting each other outside under warm afternoon sunlight",
        "first of all": "a child starting a simple craft project by placing the first block on a table",
        "break down": "a small red car stopped by the road while a mechanic arrives to help",
        "fill in": "a child coloring blank shapes on a worksheet that has no letters or numbers",
        "turn off": "a child pressing a plain light switch as a lamp becomes dark, no symbols",
        "discover": "a child finding a small hidden shell under leaves with a magnifying glass",
        "give back": "a child returning a borrowed toy to a friend with a smile",
        "give somebody a call/ring": "a child happily talking on a plain phone to a friend, no screen text",
        "Guess what?": "a child excitedly whispering surprising news to a friend, no speech bubbles",
        "repeat": "a child stacking the same colored blocks in the same pattern twice",
        "upload": "a photo moving from a camera into a blank laptop screen with an upward arrow shape, no letters",
        "available": "an open empty chair at a table inviting someone to sit, no signs",
        "extinct": "a museum dinosaur skeleton display with children looking, no labels",
        "foreign": "a traveler visiting a different-looking town with unfamiliar architecture, no flags or signs",
        "good-looking": "a neatly dressed smiling person standing confidently, no mirror text",
        "helpful": "a child helping another child pick up dropped books, no writing on the books",
        "left-hand": "a child using their left hand to draw a simple picture, no writing",
        "musical": "a child playing a small guitar with floating music notes only, no words",
        "natural (NOT ARTIFICIAL)": "fresh fruit and flowers in sunlight beside a wooden table, no packaging",
        "relaxing": "a person resting in a hammock under trees with a calm sky",
        "striped": "a sweater with clear colorful stripes laid on a chair, no labels",
    }
    strict_scenes = {
        "grandchild": "a child sitting between two grandparents on grass, plain park background only",
        "headteacher": "a principal standing outdoors and greeting students, no classroom wall, no blackboard, no papers",
        "cooker": "a clean kitchen cooker with a pot on top, plain white background, no labels",
        "accommodation": "a simple bed and suitcase in a cozy room, plain wall, no posters, no writing",
        "blouse": "a plain blouse on a hanger, white background, no tag",
        "earring": "a pair of earrings on a plain surface, no tag, no box text",
        "cafeteria": "children eating lunch at tables in a bright dining room, plain walls, no menu board",
        "onion": "one onion on a plain kitchen table, no labels",
        "waitress": "a smiling waitress carrying a tray, plain cafe background, no signs or menu",
        "grape": "a bunch of grapes on a plain plate, no labels",
        "bean": "green beans in a small bowl, no labels",
        "classmate": "two schoolchildren sitting together and smiling, plain background, no books or papers with writing",
        "college": "a young student with backpack walking by a simple campus building, no signs",
        "schoolchild": "a schoolchild with backpack standing outside, plain background, no signs",
        "guidebook": "a closed green travel book beside a compass and small suitcase, no title or text",
        "review": "a child giving thumbs up beside a toy, plain background, no rating marks",
        "painter": "a painter painting a simple flower on a blank canvas with no letters",
        "photography": "a child holding a camera in a park, no posters, no text",
        "dancer": "a dancer posing on a clean stage, no poster, no spotlight signs",
        "comedy": "children laughing at a funny performer, plain stage, no banners",
        "hobby": "a child painting a toy model at a table, no papers with writing",
        "download": "a simple cloud and arrow moving toward a blank laptop screen, no letters",
        "shop assistant": "a shop worker handing a toy to a child at a counter, no price tags, no signs",
        "shopper": "a shopper holding bags in a plain store aisle, no signs",
        "zebra": "a zebra standing on grass, no background signs",
        "environment": "a clean earth-shaped globe with trees and plants around it, no words",
        "September": "children walking to school with autumn leaves, no calendar, no writing",
        "weekday": "a child walking to school on a normal morning, no calendar, no labels",
        "petrol": "a red fuel can beside a small toy car, no labels, no numbers",
        "sightseeing": "a family looking at a scenic landmark from a viewpoint, no signs",
        "department": "several office workers in separate plain rooms, no signs, no labels",
        "alright": "a smiling child giving a thumbs up, plain background, no speech bubble",
        "first of all": "a child placing the first wooden block on a table, no numbers, no labels",
        "give back": "a child returning a toy to a friend, plain background, no speech bubble",
        "attractive": "a neat colorful garden scene with flowers and sunlight, no people holding signs",
        "animal": "a dog, rabbit, and small bird standing together on grass",
        "creature": "three very different living creatures together: a small mammal, a bird, and an insect",
        "insect": "three clearly different insects on leaves: a beetle, a butterfly, and a ladybird",
        "nest": "a bird nest made of twigs resting securely in a tree branch, with three plain eggs",
        "pet": "a happy child gently caring for a friendly dog and cat at home",
        "tail": "a side view of a friendly cat whose long curved tail is clearly visible and is the visual focus",
        "wildlife": "several wild animals living freely in a natural meadow and woodland habitat",
        "wing": "a close side view of a bird with one fully spread feathered wing as the visual focus",
    }
    scene_hints.update(strict_scenes)
    category_context = CATEGORY_CONTEXTS.get(word.get("category", ""), "an everyday situation")
    fallback_scene = (
        f"a simple real-life scene that clearly represents {english}, "
        f"specifically in the context of {category_context}"
    )
    scene = FAMILY_SCENES.get(
        word["id"],
        COLOR_SCENES.get(
            word["id"],
            WEATHER_SCENES.get(
                word["id"],
                ELECTRONICS_SCENES.get(
                    word["id"],
                    IDENTITY_SCENES.get(
                        word["id"],
                        CALENDAR_SCENES.get(
                            word["id"],
                            NUMBER_SCENES.get(
                                word["id"],
                                NATURAL_PLACE_SCENES.get(
                                    word["id"],
                                    scene_hints.get(english, fallback_scene),
                                ),
                            ),
                        ),
                    ),
                ),
            ),
        ),
    )
    return (
        f"Create a standalone storybook illustration: {scene}. "
        "Use a centered subject, simple clean background, bright natural colors, soft friendly style, safe for children. "
        "Scene only, full image illustration. Use plain blank surfaces. Avoid any object that could contain writing."
    )


def build_negative_prompt() -> str:
    return (
        "text, words, letters, numbers, Chinese characters, English letters, caption, title, label, sign, "
        "poster, card, worksheet, book cover, page layout, interface, screen text, watermark, logo, border, frame, speech bubble, typography"
    )


def prepare_workflow(
    template: dict[str, Any],
    word: dict[str, Any],
    width: int,
    height: int,
    seed: int,
    filename_prefix: str,
) -> dict[str, Any]:
    workflow = json.loads(json.dumps(template))
    positive_clip_ref: list[Any] | None = None
    for node in workflow.values():
        class_type = node.get("class_type")
        inputs = node.get("inputs", {})
        if class_type == "CLIPTextEncode" and "text" in inputs:
            inputs["text"] = build_prompt(word)
            positive_clip_ref = inputs.get("clip")
        elif class_type in {"EmptySD3LatentImage", "EmptyLatentImage"}:
            inputs["width"] = width
            inputs["height"] = height
            inputs["batch_size"] = 1
        elif class_type == "KSampler":
            inputs["seed"] = seed
            inputs["negative"] = ["vocab_negative_prompt", 0]
        elif class_type == "SaveImage":
            inputs["filename_prefix"] = filename_prefix
    if positive_clip_ref is None:
        raise RuntimeError("No CLIPTextEncode node with a clip input found in workflow template")
    workflow["vocab_negative_prompt"] = {
        "class_type": "CLIPTextEncode",
        "inputs": {
            "text": build_negative_prompt(),
            "clip": positive_clip_ref,
        },
    }
    return workflow


def queue_and_wait(comfy_url: str, workflow: dict[str, Any], client_id: str, timeout: int) -> dict[str, Any]:
    response = post_json(f"{comfy_url}/prompt", {"prompt": workflow, "client_id": client_id})
    prompt_id = response["prompt_id"]
    started_at = time.time()

    while time.time() - started_at < timeout:
        history = get_json(f"{comfy_url}/history/{prompt_id}")
        if prompt_id in history:
            item = history[prompt_id]
            if item.get("status", {}).get("status_str") == "error":
                raise RuntimeError(json.dumps(item.get("status"), ensure_ascii=False))
            return item
        time.sleep(1.5)

    raise TimeoutError(f"Timed out waiting for ComfyUI prompt {prompt_id}")


def output_images_from_history(history_item: dict[str, Any]) -> list[Path]:
    paths: list[Path] = []
    for output in history_item.get("outputs", {}).values():
        for image in output.get("images", []):
            filename = image["filename"]
            subfolder = image.get("subfolder") or ""
            paths.append(COMFY_OUTPUT_ROOT / subfolder / filename)
    return paths


def make_contact_sheet(records: list[dict[str, Any]], output_path: Path, with_labels: bool) -> None:
    thumb_size = 180
    label_height = 56 if with_labels else 0
    columns = 5 if with_labels else 10
    row_height = thumb_size + label_height
    rows = (len(records) + columns - 1) // columns
    sheet = Image.new("RGB", (columns * thumb_size, rows * row_height), "white")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()

    for index, record in enumerate(records):
        x = (index % columns) * thumb_size
        y = (index // columns) * row_height
        with Image.open(record["samplePath"]) as image:
            image = image.convert("RGB")
            image.thumbnail((thumb_size, thumb_size), Image.Resampling.LANCZOS)
            ox = x + (thumb_size - image.width) // 2
            oy = y + (thumb_size - image.height) // 2
            sheet.paste(image, (ox, oy))

        if with_labels:
            label = f"{index + 1}. {record['english']}\n{record['wordId']}"
            draw.multiline_text((x + 6, y + thumb_size + 6), label, fill=(30, 30, 30), font=font, spacing=3)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output_path, quality=92)


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate sample word images through local ComfyUI.")
    parser.add_argument("--limit", type=int, default=10)
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--word-ids", nargs="*", help="Generate specific word ids instead of offset/limit selection.")
    parser.add_argument("--allow-approved", action="store_true", help="Allow regenerating words that are already imageApproved.")
    parser.add_argument("--width", type=int, default=512)
    parser.add_argument("--height", type=int, default=512)
    parser.add_argument("--timeout", type=int, default=600)
    parser.add_argument("--comfy-url", default="http://127.0.0.1:8188")
    parser.add_argument("--output-root", type=Path, default=DEFAULT_OUTPUT_ROOT)
    args = parser.parse_args()

    template = json.loads(WORKFLOW_TEMPLATE_PATH.read_text(encoding="utf-8"))
    missing_words = load_words(args.allow_approved)
    if args.word_ids:
        by_id = {word["id"]: word for word in missing_words}
        selected_words = [by_id[word_id] for word_id in args.word_ids if word_id in by_id]
        missing_ids = [word_id for word_id in args.word_ids if word_id not in by_id]
        if missing_ids:
            raise SystemExit(f"Unknown or already-approved word ids: {', '.join(missing_ids)}")
    else:
        selected_words = missing_words[args.offset : args.offset + args.limit]
    run_id = datetime.now().strftime("comfy-sample-%Y%m%d-%H%M%S")
    run_dir = args.output_root / run_id
    sample_dir = run_dir / "samples"
    sample_dir.mkdir(parents=True, exist_ok=True)

    client_id = f"vocab-rabbit-{uuid.uuid4()}"
    records: list[dict[str, Any]] = []

    for index, word in enumerate(selected_words, start=1):
        word_id = word["id"]
        seed = int(time.time() * 1000) % 1_000_000_000_000 + index
        filename_prefix = f"vocab_rabbit_samples/{word_id}"
        workflow = prepare_workflow(template, word, args.width, args.height, seed, filename_prefix)
        print(f"[{index}/{len(selected_words)}] queue {word_id} {word['english']} seed={seed}", flush=True)
        history_item = queue_and_wait(args.comfy_url, workflow, client_id, args.timeout)
        output_paths = output_images_from_history(history_item)
        if not output_paths:
            raise RuntimeError(f"No output image for {word_id}")

        source_path = output_paths[0]
        sample_path = sample_dir / f"{word_id}.png"
        shutil.copy2(source_path, sample_path)
        records.append(
            {
                "wordId": word_id,
                "english": word["english"],
                "chinese": word.get("chinese", ""),
                "category": word.get("category", ""),
                "seed": seed,
                "prompt": build_prompt(word),
                "comfyOutputPath": str(source_path),
                "samplePath": str(sample_path),
            }
        )

    manifest = {
        "meta": {
            "runId": run_id,
            "workflowTemplate": str(WORKFLOW_TEMPLATE_PATH),
            "comfyUrl": args.comfy_url,
            "width": args.width,
            "height": args.height,
        },
        "records": records,
    }
    (run_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    make_contact_sheet(records, run_dir / "contact-sheet.jpg", with_labels=True)
    make_contact_sheet(records, run_dir / "contact-sheet-clean.jpg", with_labels=False)

    print(f"run_dir={run_dir}")
    print(f"contact_sheet={run_dir / 'contact-sheet.jpg'}")
    print(f"contact_sheet_clean={run_dir / 'contact-sheet-clean.jpg'}")


if __name__ == "__main__":
    main()
