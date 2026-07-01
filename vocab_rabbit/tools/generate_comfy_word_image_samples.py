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
COMFY_MANIFEST_PATH = PROJECT_ROOT / "public/content/words/comfy-image-manifest.json"
WORKFLOW_TEMPLATE_PATH = PROJECT_ROOT / "tools/workflows/z-image-turbo.api-prompt.json"
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

BUILDING_SCENES = {
    "ket_apartment_building_n": "a modern multi-story apartment building with many windows and balconies",
    "ket_department_store_n": "a large indoor department store with clothing, toys, home goods, and shoppers, no signs",
    "ket_hotel_n": "a welcoming hotel entrance with a reception desk, luggage trolley, and travelers, no signs",
    "ket_shop_n_v": "a small street shop with clear display windows, goods inside, and a shopper entering, no signs",
    "ket_bank_n": "a bank interior with a teller counter, a secure vault door, and a customer, no signs",
    "ket_block_n": "an aerial view of one complete plain residential city block with simple houses, surrounded on all four sides by streets, no shops or signs",
    "ket_lift_n": "an open elevator inside a building with a person stepping into it, no buttons with numbers",
    "ket_supermarket_n": "a bright supermarket with food aisles, produce shelves, and a shopper pushing a cart, no signs",
    "ket_exit_n": "a person clearly leaving a building through an open doorway into a sunny garden, with no sign above or beside the door",
    "ket_building_n": "one clear modern building standing alone against a simple sky",
    "ket_factory_n": "a clean factory building with large windows, pipes, and tall chimneys",
    "ket_office_n": "a modern office with several desks, computers with blank screens, and coworkers",
    "ket_pharmacy_n": "a clean pharmacy counter with medicine bottles, shelves, and a helpful worker, all labels blank",
    "ket_police_station_n": "two uniformed police officers and a police car outside a blue public building with a completely blank facade",
    "ket_castle_n": "a large stone castle with towers, walls, and a raised flag with no symbol",
    "ket_grocery_store_n_am_eng": "a small grocery store filled with fruit, vegetables, bread, and food shelves, no signs",
    "ket_post_office_n": "a post office counter where a worker receives plain parcels and envelopes, no signs",
    "ket_guest_house_n": "a cozy small guest house with made beds visible and travelers' suitcases by the door, no signboard",
    "ket_railway_station_n": "a railway station platform with a passenger train, clock without numbers, and waiting travelers",
    "ket_petrol_station_n": "a car beside a fuel pump at a petrol station, with all price displays and labels blank",
    "ket_restaurant_n": "a welcoming restaurant dining room with set tables, diners, and a server, no menus with writing",
    "ket_court_n": "a courtroom with a judge's bench, wooden gavel, and orderly seating, no seals or writing",
    "ket_gallery_n": "an art gallery with visitors viewing several colorful framed paintings, no labels",
    "ket_gym_n": "a bright gym with exercise bikes, weights, mats, and people exercising, no signs",
}

CITY_SCENES = {
    "ket_airport_n": "a modern airport terminal with a passenger plane outside and travelers carrying luggage, no signs",
    "ket_city_centre_n": "a busy central plaza surrounded by tall city buildings, shops, trees, and many pedestrians, no signs",
    "ket_station_n": "a railway station with a train beside a covered platform and waiting passengers, no signs",
    "ket_bridge_n": "one strong bridge carrying a road across a wide blue river",
    "ket_corner_n": "a clear street corner where two pavements and two roads meet at a right angle",
    "ket_playground_n": "a children's playground with swings, slide, climbing frame, and children playing",
    "ket_street_n": "a pleasant city street lined with buildings, pavement, trees, and a few cars",
    "ket_bus_station_n": "a bus station with several buses parked beside covered passenger bays, no signs",
    "ket_market_n": "an open-air market with fruit and vegetables piled directly on plain wooden tables, shoppers nearby, no hanging tags, cards, labels, or signs",
    "ket_road_n": "a clear paved road winding through a simple landscape",
    "ket_town_n": "a small town made of plain homes only along one main street, with trees and people walking, no shops, clocks, plaques, or signs",
    "ket_bus_stop_n": "a city bus stopping beside a plain covered shelter where passengers wait, no sign",
    "ket_motorway_n": "a wide multi-lane motorway with cars traveling in both directions, no road signs",
    "ket_roundabout_n": "several small cars driving around a circular road with a planted island in the middle, no signs",
    "ket_underground_n_adj": "an underground subway train moving through a station tunnel below street level, no signs",
    "ket_square_n_adj": "a perfectly square town plaza viewed from above, bordered by four equal straight sides",
    "ket_zoo_n": "a zoo with visitors safely viewing elephants, giraffes, and monkeys in spacious habitats, no signs",
    "ket_capital_n": "a grand capital city skyline with an important domed government building and busy streets, no flags or signs",
    "ket_centre_center_n": "one red ball exactly at the center of a circle made from many blue balls",
    "ket_city_n": "a large modern city skyline with many tall buildings, streets, parks, and traffic",
    "ket_crossing_n": "children safely walking across a clear zebra crossing while cars wait",
    "ket_directions_n": "a person choosing between several branching paths shown by plain colored arrows with no words",
}

NATURE_SCENES = {
    "ket_air_n": "a child inflating a balloon while a gentle breeze moves nearby leaves and a curtain",
    "ket_fire_n": "one small safe campfire burning inside a ring of stones outdoors",
    "ket_moon_n": "a large bright moon in a clear dark night sky above quiet hills",
    "ket_star_n_v": "one large bright star shining clearly among a few smaller stars in the night sky",
    "ket_autumn_n": "an autumn park with orange leaves falling from trees and covering the ground",
    "ket_flower_n": "one large colorful flower blooming clearly against a simple garden background",
    "ket_summer_n": "a bright hot summer day with children playing by water under strong sunshine",
    "ket_north_n_adj_adv": "one large blue arrow pointing upward from a green valley toward snowy polar mountains, without a compass and with no letters",
    "ket_tree_n": "one healthy leafy tree with a clear trunk, branches, and green crown",
    "ket_bee_n": "one friendly bee flying beside a flower",
    "ket_grass_n": "a close view of a thick patch of fresh green grass",
    "ket_plant_n": "one healthy green potted plant with roots, stem, and leaves visible",
    "ket_water_n": "clear fresh water pouring from a jug into a glass beside a small stream",
    "ket_country_n": "one broad country landscape containing a city, farms, mountains, and coast beside a plain flag with no symbol, no map outline or labels",
    "ket_grow_v": "one plant shown naturally progressing from a small sprout to a tall flowering plant, no arrows or labels",
    "ket_west_n_adj_adv": "one large orange arrow pointing left across a landscape toward a setting sun, without a compass and with no letters",
    "ket_countryside_n": "wide peaceful countryside with farms, green fields, trees, and distant hills",
    "ket_winter_n": "a cold winter landscape with snow-covered trees, frozen pond, and a warmly dressed child",
    "ket_desert_n": "a wide sandy desert with dunes, cactus, rocks, and strong sunshine",
    "ket_hot_adj": "a child feeling very hot under strong sunshine beside a thermometer with no numbers",
    "ket_east_n_adj_adv": "one large yellow arrow pointing right across a landscape toward a rising sun, without a compass and with no letters",
    "ket_south_n_adj_adv": "one large orange arrow pointing downward from cool hills toward a warm tropical beach, without a compass and with no letters",
    "ket_wool_n": "a fluffy sheep beside a soft ball of plain wool yarn",
    "ket_explorer_n": "an explorer with backpack, binoculars, and walking boots discovering a mountain valley",
    "ket_space_n": "outer space filled with planets, stars, a moon, and a small spacecraft with no logos",
    "ket_world_n": "the planet Earth shown as a friendly blue and green globe with no map labels",
    "ket_spring_n": "a fresh spring meadow with new green leaves, blossoms, butterflies, and gentle sunshine",
    "ket_environment_n": "a clean Earth surrounded by healthy trees, clear water, animals, and children caring for plants",
    "ket_nature_n": "a rich natural landscape combining mountains, forest, river, flowers, birds, and wild animals",
}

WORK_SCENES = {
    "ket_journalist_n": "a journalist holding a plain microphone while interviewing a firefighter as a camera operator records them, no logos or writing",
    "ket_secretary_n": "an office secretary organizing blank papers, answering a telephone, and arranging a manager's appointments at a tidy desk",
    "ket_artist_n": "an artist in a paint-marked apron creating a colorful landscape on an easel in a bright studio",
    "ket_king_n": "a friendly king wearing a gold crown and royal robe while seated on a simple throne",
    "ket_boss_n": "a confident workplace boss leading a small team discussion around a table with completely blank papers",
    "ket_manager_n": "a store manager in smart clothes checking shelves while guiding two employees in a tidy shop, no signs or labels",
    "ket_business_n": "a small shop exchanging goods and coins between a shopkeeper and customer, with shelves of products and no signs",
    "ket_earn_v": "a close clear view of a bicycle repair worker receiving coins after completing a repair, with a happy customer placing a pile of coins into the repair worker's open hand and the repaired bicycle beside them, no price labels",
    "ket_staff_n": "a group of five friendly staff members wearing matching plain uniforms together inside a cafe, no logos",
    "ket_businessman_n": "a professional businessman in a suit carrying a briefcase and shaking hands with a customer in an office lobby",
    "ket_businesswoman_n": "a professional businesswoman in a suit carrying a briefcase and shaking hands with a customer in an office lobby",
    "ket_cleaner_n": "a cleaner wearing gloves and using a mop and bucket to clean a shiny floor",
    "ket_occupation_n": "four adults clearly showing different occupations: a builder, chef, nurse, and farmer in their work clothes",
    "ket_company_n": "a whole company team working together at desks inside one bright office, viewed through an open wall, no company name",
    "ket_farmer_n": "a farmer in boots tending vegetables beside a tractor and barn on a sunny farm",
    "ket_footballer_n": "a footballer in a plain sports kit skillfully kicking a football on a grass pitch, no numbers or logos",
    "ket_work_n_v": "a person actively working with hand tools to repair a wooden chair in a workshop",
    "ket_worker_n": "a construction worker in a hard hat building a brick wall with tools at a safe building site",
    "ket_writer_n": "one clearly visible adult writer seated at a desk, actively writing a story by hand on completely blank-looking paper, with their face, writing hand, and pencil clearly visible",
    "ket_guide_n": "a tour guide leading a small group around a famous castle and pointing out its features, no flag or sign",
    "ket_police_officer_n": "a friendly police officer in a plain recognizable uniform helping a child safely cross a street, no badge text",
    "ket_queen_n": "a friendly queen wearing a jeweled crown and royal gown while seated on a simple throne",
    "ket_job_n": "a bakery worker doing a clear paid job by serving fresh bread to a customer across a counter, no signs or prices",
    "ket_receptionist_n": "a receptionist behind a front desk warmly welcoming a visitor and handing over a plain room key, no desk sign",
    "ket_career_n": "three stages of one person's working life: the same female doctor shown at three clear career stages as a young medical trainee, experienced doctor, and senior doctor mentoring a trainee, all wearing plain medical clothes with no badges",
    "ket_department_n": "three open work areas with no walls inside one large store: bakers arranging bread, produce workers arranging vegetables, and clothing workers folding shirts, no frames, boards, papers, signs, or screens",
    "ket_scientist_n": "a scientist in a lab coat carefully examining colorful liquid in glass beakers at a safe laboratory bench, no labels",
    "ket_trainer_n": "an athletic trainer coaching two runners through warm-up exercises beside a running track, no stopwatch numbers",
}

CLOTHING_SCENES = {
    "ket_backpack_n": "one sturdy solid-color school backpack with two shoulder straps and several zipped pockets, standing upright, front surface completely blank and undecorated with no logo, emblem, pattern, or patch",
    "ket_fashion_n": "three stylish adults modeling distinctly fashionable colorful outfits on a simple runway, no banners or logos",
    "ket_purse_n": "one small coin purse opened to show a few plain coins, with a clasp and no printed marks",
    "ket_swimsuit_n": "a cheerful child wearing a modest one-piece swimsuit beside a swimming pool, no logos",
    "ket_bag_n": "one simple reusable cloth carry bag with two handles, holding fruit and a towel, no writing",
    "ket_get_dressed_v": "a child actively getting dressed by pulling on a sweater beside neatly laid-out trousers and socks",
    "ket_raincoat_n": "one bright yellow waterproof raincoat with hood and buttons, hanging beside raindrops, no brand",
    "ket_tie_n": "one striped necktie neatly knotted around the collar of a plain white shirt, no label",
    "ket_bathing_suit_n": "one modest colorful bathing suit displayed clearly on a plain clothes hanger beside a beach towel",
    "ket_glasses_n_pl": "one pair of clear-lens reading glasses with visible frames and folded arms on a plain table",
    "ket_ring_n_v": "one gold finger ring with a small jewel shown clearly on a plain hand, no box or writing",
    "ket_tights_n_pl": "a pair of opaque purple tights clearly displayed on a child-size clothing mannequin, safe and modest",
    "ket_belt_n": "one brown leather belt laid in a gentle curve with its buckle clearly visible, no logo",
    "ket_glove_n": "a matching pair of warm winter gloves placed side by side on snow",
    "ket_blouse_n": "one elegant women's blouse with collar, buttons, and soft sleeves displayed on a hanger",
    "ket_handbag_n": "one structured women's handbag with short handles and a clasp sitting upright, no logo",
    "ket_scarf_n": "one long warm knitted scarf wrapped loosely around a child's neck in winter",
    "ket_trousers_n_pl": "one full pair of plain trousers displayed from waist to ankles on a hanger",
    "ket_boot_n": "one single plain yellow rubber rain boot standing beside a small puddle, with a smooth uninterrupted shaft and no straps, patches, tags, buckles, or marks",
    "ket_hat_n": "one wide-brimmed sun hat with a simple ribbon displayed against a plain background",
    "ket_shirt_n": "one collared button-up shirt neatly displayed on a hanger, completely plain with no label",
    "ket_try_on_phr_v": "a child trying on a jacket in front of a shop mirror while a parent checks the fit, no signs",
    "ket_bracelet_n": "one colorful bead bracelet circling a wrist, shown in close view with no letters",
    "ket_hoodie_n": "one plain hooded sweatshirt with front pocket and hood clearly visible on a hanger",
    "ket_t_shirt_n": "one plain short-sleeved T-shirt displayed flat with no picture, letters, or logo",
    "ket_cap_n": "one plain baseball cap with a curved peak, shown from the side with no logo",
    "ket_shorts_n_pl": "one pair of knee-length shorts displayed clearly from waistband to hems",
    "ket_umbrella_n": "one child clearly holding an open colorful umbrella in falling rain, with a straight handle visibly connected to the canopy and gripped in the child's hand, no isolated handle shape, letters, or writing",
    "ket_chain_n": "a close view of one plain silver chain made of clearly interlocking metal links, no pendant",
    "ket_jeans_n_pl": "one full pair of blue denim jeans with pockets and seams displayed on a hanger",
    "ket_skirt_n": "one knee-length pleated skirt displayed clearly on a hanger",
    "ket_uniform_n": "a school child wearing a complete plain school uniform with matching jacket, shirt, and trousers, no badge",
    "ket_clothes_n_pl": "a neat group of different clothes together: shirt, trousers, dress, coat, and socks on a rack",
    "ket_sock_n": "a matching pair of colorful ankle socks placed side by side, no pattern letters",
    "ket_wallet_n": "one open bifold wallet showing plain cards and a few notes with no readable details",
    "ket_coat_n": "one long warm winter coat with buttons and pockets displayed on a hanger",
    "ket_jumper_n": "one thick knitted pullover jumper with long sleeves folded neatly, no logo",
    "ket_suit_n": "an adult wearing a complete smart suit with matching jacket and trousers, plain shirt, and tie",
    "ket_watch_n_v": "one analog wristwatch strapped around a wrist, with plain hands and no written numbers",
    "ket_costume_n": "a child wearing a colorful stage pirate costume with hat and cape, no skull symbol or writing",
    "ket_kit_n": "a complete plain football kit laid out together: jersey, shorts, socks, boots, and ball, no numbers or logos",
    "ket_sunglasses_n_pl": "one pair of dark-lens sunglasses with visible frames on a sunny beach towel, no logo",
    "ket_wear_v": "a child already wearing a bright red coat, scarf, and boots and happily pointing to the outfit",
    "ket_dress_n_v": "a child actively putting on a colorful knee-length dress with help from a parent, safe and modest",
    "ket_necklace_n": "one necklace with a simple round pendant worn around a neck, shown clearly with no letters",
    "ket_sweater_n": "a child wearing one warm knitted sweater with long sleeves on a cold day, no pattern letters",
    "ket_earring_n": "a matching pair of small hoop earrings displayed together on a plain jewelry stand",
    "ket_pocket_n": "a close view of a clear fabric pocket on the front of trousers with a hand placing a coin inside",
}

HOUSE_SCENES = {
    "ket_address_n": "a courier arriving at one clearly chosen home in a row of houses and handing a plain parcel to the resident, no numbers, maps, labels, or writing",
    "ket_clock_n": "one round wall clock with two clear hands and simple tick marks but no written numbers",
    "ket_furniture_n": "a coordinated group of household furniture together in one room: sofa, armchair, table, chair, and cabinet",
    "ket_oven_n": "one built-in kitchen oven with its door open and a tray of bread inside, no controls with letters or numbers",
    "ket_apartment_n": "a cutaway view of one furnished apartment inside a multi-storey apartment building, no building signs",
    "ket_computer_n": "one desktop computer with monitor, keyboard, and mouse on a desk, screen completely blank",
    "ket_garage_n": "one home garage with its wide door open and a car parked safely inside, no signs or numbers",
    "ket_pillow_n": "one soft plump sleeping pillow resting at the head of a neatly made bed",
    "ket_armchair_n": "one comfortable upholstered armchair with two clear armrests and a high back",
    "ket_cooker_n": "one freestanding kitchen cooker with four plain burners and an oven below, no labels or numbers",
    "ket_garden_n": "a tidy home garden with flower beds, vegetables, a small path, and a person watering plants",
    "ket_refrigerator_n": "one tall refrigerator with its door open to show neatly arranged fresh food, no labels",
    "ket_bath_n": "a child safely taking a warm bubble bath with a toy duck while a parent waits nearby, fully modest",
    "ket_bathtub_n": "one empty clean white bathtub with faucet and folded towel, clearly shown as the main object",
    "ket_cupboard_n": "one kitchen cupboard with two doors open to show neatly stacked plates and cups",
    "ket_roof_n": "a close exterior view of the sloping tiled roof on top of a small house",
    "ket_bathroom_n": "a complete clean bathroom containing bathtub, sink, toilet, mirror, and towel, no people",
    "ket_curtain_n": "a matching pair of fabric curtains hanging on both sides of a sunny window",
    "ket_gate_n": "one garden gate standing open in a low fence at the start of a path",
    "ket_room_n": "one simple furnished room with four walls, window, chair, small table, and rug",
    "ket_bed_n": "one complete bed with mattress, headboard, pillow, sheet, and blanket",
    "ket_desk_n": "one study desk with drawers, a plain lamp, and a closed blank notebook",
    "ket_hall_n": "a spacious entrance hall inside a home with several doorways, stairs, and a coat stand",
    "ket_rubbish_unc_n": "a small pile of household rubbish including crumpled paper, empty plain containers, and food scraps",
    "ket_bedroom_n": "a cozy bedroom with a bed, bedside table, wardrobe, lamp, and window",
    "ket_dining_room_n": "a dining room with a large table set for a family meal and chairs around it",
    "ket_heating_n": "a warm home radiator glowing gently while a child warms their hands nearby on a cold day",
    "ket_safe_adj": "a family protected safely inside a strong cozy home while heavy rain and wind remain outside",
    "ket_bin_n": "one household rubbish bin with its lid open beside a person dropping in a plain wrapper",
    "ket_door_n": "one plain wooden front door with handle and hinges shown clearly, no number or sign",
    "ket_home_n_adv": "a family relaxing together inside their cozy home with familiar furniture, photos shown only as blank color shapes, and a pet",
    "ket_shelf_n": "one simple wall shelf holding three plain household objects, clearly showing the flat shelf board",
    "ket_blanket_n": "one thick warm blanket spread partly across a bed with its soft texture clearly visible",
    "ket_downstairs_adv": "a person walking down a staircase from the upper floor toward the clearly visible lower floor",
    "ket_house_n": "the exterior of one detached house with roof, windows, front door, chimney, and small garden, no number",
    "ket_shower_n": "one bathroom shower spraying clear water from a wall-mounted shower head into an empty shower area",
    "ket_bookcase_n": "one tall freestanding wooden bookcase with several shelves full of colorful blank-spine books",
    "ket_drawer_n": "one desk drawer pulled fully open to show a few simple objects inside",
    "ket_key_n": "one large plain metal house key beside a simple door lock, no key-ring tag",
    "ket_sink_n": "one porcelain kitchen sink with faucet, drain, and a little clear water, shown as the main object",
    "ket_bookshelf_n": "one long wall-mounted bookshelf holding a row of colorful blank-spine books",
    "ket_dvd_player_n": "one slim rectangular black DVD player below a blank television, with a flat disc tray extended, a plain shiny disc on the tray, and a remote control beside it, no tonearm or turntable, letters, display text, or logos",
    "ket_kitchen_n": "a complete home kitchen with counters, sink, cooker, refrigerator, cupboards, and food preparation area",
    "ket_sitting_room_n": "a comfortable sitting room arranged for conversation with two armchairs facing a small table",
    "ket_bowl_n": "one empty round ceramic bowl shown clearly from a slight angle on a plain table",
    "ket_entrance_n": "a clear building entrance with open double doors and two people walking into it, no sign",
    "ket_lamp_n": "one table lamp with shade, stand, and warm glowing bulb on a bedside table",
    "ket_sofa_n": "one long comfortable three-seat sofa with cushions, shown as the main object",
    "ket_box_n": "one plain cardboard box opened to show its four sides and empty inside, no labels",
    "ket_flat_n": "one compact furnished flat interior high above a city, combining a small living area and kitchen",
    "ket_light_n_adj": "one bright ceiling light switched on and clearly illuminating an otherwise dim room",
    "ket_stay_v": "a traveler temporarily staying in a guest bedroom with an open suitcase beside the bed",
    "ket_carpet_n": "one large soft wall-to-wall carpet covering most of a room floor, with its texture clearly visible",
    "ket_floor_n": "a close view of a clean wooden floor while a person mops across the floor surface",
    "ket_live_v": "a family living in their home while cooking, reading, and playing together in connected rooms",
    "ket_toilet_n": "one clean modern toilet with lid, seat, tank, and flush handle, shown alone in a bathroom",
    "ket_chair_n": "one simple wooden dining chair with four legs, seat, and backrest",
    "ket_fridge_n": "one compact fridge with its door open to show milk, fruit, and vegetables with blank packaging",
    "ket_living_room_n": "a complete family living room with sofa, coffee table, rug, lamp, and family relaxing together",
    "ket_towel_n": "one folded bath towel beside one towel hanging neatly from a rail",
    "ket_accommodation_n": "a welcoming temporary accommodation room with made bed, bedside lamp, bathroom door, and travel suitcase",
    "ket_alarm_clock_n": "one twin-bell alarm clock ringing with motion lines, simple clock hands, and no written numbers",
    "ket_bottom_n": "a stack of three plain boxes with the lowest red box clearly emphasized at the bottom",
    "ket_cabinet_n": "one freestanding storage cabinet with doors open to show neatly arranged household items",
    "ket_ceiling_n": "an upward interior view focused on a room ceiling with light fixture and the tops of four walls",
    "ket_closet_n": "one built-in closet with sliding doors open to show hanging clothes and shoes",
    "ket_fan_n": "one electric standing fan with round protective grille and clearly visible blades, no control labels",
    "ket_front_n": "a straight-on view of the front of one house showing its door, windows, and porch symmetrically",
    "ket_ground_n": "a child standing firmly on the outdoor ground beside a house, with the soil and grass surface clearly emphasized",
    "ket_mug_n": "one ceramic drinking mug with a large handle and warm drink inside, no writing or picture",
    "ket_sheet_n": "one clean plain bed sheet being spread smoothly across a mattress",
    "ket_stairs_n_pl": "one complete indoor staircase with many steps, handrail, upper landing, and lower floor visible",
    "ket_table_n": "one plain rectangular dining table with four legs, shown alone as the main object",
    "ket_top_n": "a stack of three plain boxes with one bright red ball resting clearly on the top",
    "ket_wall_n": "one plain interior wall being painted with a roller, clearly showing the broad wall surface",
    "ket_wardrobe_n": "one tall bedroom wardrobe with two doors open to show hanging clothes and folded items",
    "ket_washing_up_n": "a person washing plates and cups in a kitchen sink with bubbles and a drying rack nearby",
}

SPORT_SCENES = {
    "ket_ball_n": "one simple colorful round ball resting on grass, shown clearly as the main object with no logo",
    "ket_football_n": "one classic black-and-white football resting beside a plain goal net, no logos",
    "ket_riding_n": "a helmeted rider practicing horse riding in a safe fenced arena",
    "ket_swimming_n": "one swimmer actively swimming freestyle through a clear pool lane, no lane numbers",
    "ket_badminton_n": "two players hitting a shuttlecock across a badminton net with plain rackets",
    "ket_football_player_n": "one football player in a plain kit dribbling a ball on a grass pitch, no number or logo",
    "ket_rugby_n": "two rugby players safely passing an oval ball on a grass field, plain kits with no numbers",
    "ket_baseball_n": "a baseball player swinging a wooden bat toward a pitched white ball on a baseball field",
    "ket_game_n": "four children actively playing a simple team ball game together on a playground",
    "ket_swimming_pool_n": "a full swimming pool with clear blue water, lane ropes, starting blocks, and swimmers, no numbers",
    "ket_basketball_n": "a basketball player shooting an orange ball toward a hoop on an outdoor court",
    "ket_goal_n": "a football flying into a clear goal net while a goalkeeper reaches for it, no scoreboard",
    "ket_sailing_n": "a sailor controlling a small sailboat with one white sail across open blue water",
    "ket_bat_n": "one plain wooden baseball bat lying beside a white baseball, no writing or logo",
    "ket_golf_n": "a golfer swinging a club toward a ball on a green golf course with a plain flag",
    "ket_sea_n": "a wide open blue sea with waves stretching to the horizon and one tiny distant sailboat",
    "ket_table_tennis_n": "two players hitting a small ball across a table tennis table and net",
    "ket_hockey_n": "two field hockey players using curved sticks to compete for a ball on grass, no numbers",
    "ket_skate_v": "a child wearing ice skates and actively skating across a safe frozen rink",
    "ket_team_n": "a diverse sports team in matching plain uniforms forming a supportive huddle, no logos",
    "ket_skateboard_n": "one plain skateboard shown from the side with deck, trucks, and four wheels, no graphic",
    "ket_tennis_n": "two tennis players rallying a ball across a court net with plain rackets",
    "ket_luck_n": "a child throwing a basketball backward over one shoulder with eyes closed while facing away from the hoop, the ball dropping perfectly into the basket as two friends react with surprise, a clearly lucky shot",
    "ket_ski_v": "one skier actively skiing downhill between safe course markers on a snowy slope, no signs",
    "ket_tennis_player_n": "one tennis player in plain sportswear serving a ball with a racket, no logos",
    "ket_skiing_n": "several people enjoying downhill skiing together on a broad snowy mountain slope",
    "ket_throw_v": "one child clearly throwing a red ball through the air toward a friend",
    "ket_boat_n": "one small simple rowboat floating on calm water with two oars inside",
    "ket_snowboard_n": "one plain snowboard with bindings standing upright in clean snow, no graphics",
    "ket_catch_v": "one child catching a red ball securely with both hands while it arrives through the air",
    "ket_player_n": "one clearly recognizable sports player in a plain uniform holding a ball ready to join a game",
    "ket_snowboarding_n": "a snowboarder in helmet and plain winter clothes carving safely down a snowy slope",
    "ket_climb_v": "a child wearing a safety harness actively climbing an indoor rock wall with colored holds",
    "ket_pool_n": "one small round backyard pool filled with clear water beside a garden chair",
    "ket_soccer_n": "children actively playing soccer together on a grass field with a ball and two plain goals",
    "ket_sport_n": "four athletes together demonstrating different sports: running, tennis, basketball, and swimming",
    "ket_v_versus_prep": "two opposing teams facing each other across a central line before a match, one team red and one blue, no letters",
    "ket_sports_centre_n": "a large indoor sports centre cutaway showing a basketball court, swimming pool, and gym, no sign",
    "ket_volleyball_n": "two teams hitting a volleyball over a high net on a beach court, no numbers",
    "ket_prize_n": "one gold trophy cup with a plain medal and ribbon arranged beside it, no writing or numbers",
    "ket_stadium_n": "a large open sports stadium with field, running track, stands, and cheering crowd, no scoreboard text",
    "ket_cricket_n": "a cricket batter using a flat wooden bat beside three plain stumps as a ball approaches",
    "ket_race_n_v": "several runners competing side by side in a race toward a plain finish ribbon, no lane numbers",
    "ket_surf_v": "one surfer actively riding along the face of a curling ocean wave on a plain board",
    "ket_racket_n": "one plain tennis racket with visible strings lying beside a tennis ball, no logo",
    "ket_surfboard_n": "one plain colorful surfboard with fins resting upright in sand, no writing or logo",
    "ket_win_v": "one runner clearly winning by crossing a plain finish ribbon ahead of the other runners, no numbers",
    "ket_enter_v": "an athlete stepping through an open stadium gate to enter a sports competition, no sign",
    "ket_surfboarding_n": "a person balancing on a surfboard while riding a medium ocean wave, safe and clearly visible",
    "ket_windsurfing_n": "a windsurfer controlling a tall colorful sail on a board across breezy blue water",
    "ket_fishing_n": "a person fishing peacefully with a rod beside a lake while a fish approaches the hook",
    "ket_ride_n_v": "a helmeted child actively riding a bicycle along a safe park path",
    "ket_winner_n": "a happy athlete standing on the highest center podium holding a trophy while others applaud, no numbers",
}

ACTION_SCENES = {
    "ket_happen_v": "a cup suddenly tipping off a table while a surprised child reacts to the unexpected spill",
    "ket_hate_v": "a child frowning and pushing away a plate of broccoli with both hands",
    "ket_have_av_v": "a smiling child holding their own red ball securely against their chest",
    "ket_help_v_n": "one child helping another child lift a fallen bicycle back upright",
    "ket_hit_v": "a child striking a flying ball with a plain wooden bat on a field",
    "ket_hold_v": "a child securely holding a large wrapped box with both arms",
    "ket_hope_v": "a child watching a newly planted seedling with an eager hopeful expression",
    "ket_hurry_v": "a child running quickly toward a bus that is about to leave, no signs",
    "ket_improve_v": "a child proudly comparing an earlier messy clay pot with a newer smooth well-shaped pot",
    "ket_include_v": "a child adding one toy animal into a circle of several toy animals",
    "ket_invent_v": "a child assembling an unusual homemade wheeled machine from simple toy parts",
    "ket_invite_v": "a child warmly welcoming a friend through an open doorway decorated with plain balloons",
    "ket_jump_v": "a child in mid-air above a skipping rope with both feet off the ground",
    "ket_keep_v": "a child placing a favorite toy safely inside a storage box and closing the lid",
    "ket_kick_n_v": "a child kicking a football forward across a grass field",
    "ket_kiss_n_v": "a parent gently kissing a child on the forehead",
    "ket_lend_v": "a child handing their book to a friend who reaches to borrow it",
    "ket_let_v": "a child holding an open garden gate so a friend can pass through",
    "ket_look_v": "a child looking carefully through binoculars toward a distant bird",
    "ket_lose_v": "a worried child searching empty pockets while their ball rolls away behind a bench",
    "ket_make_v": "a child making a small clay bowl by hand at a craft table",
    "ket_make_sure_that_v": "a child carefully checking and fastening a bicycle helmet strap before riding",
    "ket_matter_n_v": "a child protecting a cherished teddy bear from rain under a small umbrella",
    "ket_meet_v": "two children meeting for the first time and greeting each other with a handshake",
    "ket_mind_v": "a child covering their ears and frowning because another child is loudly beating a drum",
    "ket_mix_v": "a child stirring flour and eggs together in a large mixing bowl",
    "ket_need_v": "a thirsty child holding an empty water bottle and reaching toward a water jug",
    "ket_offer_n_v": "a child holding out a tray with a cup for a friend to take",
    "ket_order_n_v": "a family at a restaurant pointing to pictures of meals while a waiter listens, no writing",
    "ket_pack_v": "a child packing folded clothes into an open suitcase",
    "ket_pass_v": "one child passing a red ball directly into a friend's waiting hands",
    "ket_perform_entertain_v": "a child musician performing with a guitar on a small plain stage for an audience",
    "ket_plan_n_v": "a child arranging toy buildings and a winding route on a table before starting a project",
    "ket_point_v": "a child clearly pointing one finger toward a red ball on a shelf",
    "ket_post_v_n": "a child putting a sealed blank envelope through a street mailbox slot",
    "ket_prefer_would_prefer_v": "a child choosing an apple with a smile while leaving a sweet on the table",
    "ket_prepare_v": "a child preparing lunch by placing fruit and a sandwich into a lunch box",
    "ket_print_v": "a home printer producing a page with a simple flower picture and no writing",
    "ket_pull_v": "a child leaning backward while pulling a heavy wagon with a rope",
    "ket_push_v": "a child pushing a loaded toy wagon forward with both hands",
    "ket_put_v": "a child putting a red toy block into a blue storage box",
    "ket_receive_v": "a child receiving a wrapped parcel from a delivery worker with both hands",
    "ket_record_v": "a child recording music by singing into a microphone beside a plain audio recorder",
    "ket_relax_become_happy_v": "a calm smiling child relaxing in a hammock beneath a tree",
    "ket_sail_v": "a sailor steering a small sailboat across open blue water",
    "ket_save_v": "a child safely pulling a wet puppy from a shallow puddle with a towel ready",
    "ket_score_n_v": "a football entering a goal net while the child who kicked it celebrates",
    "ket_see_v": "a child noticing a bright rainbow in the sky and looking directly at it",
    "ket_seem_v": "a child cautiously examining a closed box that appears much heavier than expected",
    "ket_sell_v": "a market seller handing an apple to a customer who offers a coin, no signs",
    "ket_send_v": "a child placing a sealed blank envelope into a mailbox to send it away",
    "ket_serve_v": "a waiter serving a prepared meal to a seated customer at a plain table",
    "ket_shampoo_n_v": "a person washing their hair with thick shampoo foam under a shower",
    "ket_share_v": "two children sharing one plate of fruit equally between them",
    "ket_share_digitally_v": "a child tapping a plain phone while the same flower photo appears on a friend's blank phone",
    "ket_shout_v": "a child calling loudly across a playground with hands cupped around their mouth",
    "ket_shut_v": "a child using both hands to shut a large open door",
    "ket_sit_v": "a child sitting upright on a simple chair with both feet on the floor",
    "ket_sleep_v": "a child sleeping peacefully in bed with eyes closed under a blanket",
    "ket_smoke_v": "an adult outdoors smoking one cigarette with visible smoke, neutral educational depiction, no child",
    "ket_sound_v": "a hand ringing a small bell with clear curved sound waves around it",
    "ket_spell_v": "a child slowly speaking individual sounds while a teacher listens and counts on fingers, no letters",
    "ket_stand_v": "a child standing upright beside an empty chair",
    "ket_start_v": "a runner launching forward from plain starting blocks as a race begins, no numbers",
    "ket_steal_v": "a sneaky hand taking a wallet from an unattended open bag while the owner looks away",
    "ket_suppose_v": "a child studying dark clouds and choosing to carry an umbrella before leaving home",
    "ket_take_v": "a child taking one apple from a bowl on a table",
    "ket_take_part_v": "a child stepping into a circle to join friends playing a ball game",
    "ket_thank_v": "a grateful child clasping their hands and smiling toward a friend who gave a gift",
    "ket_tidy_adj_v": "a perfectly tidy bedroom with a made bed, aligned books, and toys stored in boxes",
    "ket_tidy_up_v": "a child tidying up by putting scattered toys into labeled-free storage boxes",
    "ket_train_transitive_and_intransitive_v": "a sports coach training a young runner by demonstrating a stretching exercise",
    "ket_try_v": "a determined child trying again to build a block tower after several blocks fell",
    "ket_turn_v": "a child turning a round door handle with one hand as the door begins to open",
    "ket_use_v": "a child safely using blunt scissors to cut a plain sheet of colored paper",
    "ket_wait_v": "a child waiting patiently on a bench and looking down the road for a bus, no signs",
    "ket_wake_v": "a child waking in bed with eyes opening as morning sunlight enters the room",
    "ket_want_v": "a child reaching eagerly toward a desired toy on a high shelf",
    "ket_wash_v": "a child washing both hands under running water with soap bubbles",
    "ket_worry_v": "an anxious child looking at a broken toy with hands pressed to their cheeks",
}

ADJECTIVE_SCENES = {
    "ket_action_adj": "a movie camera filming an actor making a dramatic safe leap across a small obstacle, no clapper text",
    "ket_adult_adj_n": "one clearly grown adult standing beside a young child in a neutral family scene",
    "ket_aged_adj": "a kind elderly person with grey hair and gentle facial lines sitting in a garden",
    "ket_amazed_adj": "a child with wide eyes and open mouth reacting to an enormous floating soap bubble",
    "ket_awesome_adj": "a delighted child raising both arms beneath a spectacular colorful fireworks display",
    "ket_awful_adj": "a child recoiling from a rotten smelly meal with a disgusted expression",
    "ket_blond_e_adj": "a close portrait of a smiling child with clearly visible light blond hair",
    "ket_broken_adj": "a toy car split into loose pieces with one wheel detached beside it",
    "ket_comfortable_adj": "a relaxed child resting contentedly in a soft cushioned armchair",
    "ket_correct_adj": "a child fitting the final matching shape perfectly into a simple shape puzzle",
    "ket_crowded_adj": "a city bus packed closely with many standing and seated passengers, no signs",
    "ket_dear_adj": "a child lovingly hugging a cherished old teddy bear close to their heart",
    "ket_deep_adj": "a clear swimming pool shown from the side with a diver far below the water surface",
    "ket_dirty_adj": "a pair of boots heavily covered in wet brown mud on a plain floor",
    "ket_diving_adj": "a fully equipped scuba diver swimming underwater beside colorful fish",
    "ket_double_adj": "two identical ice cream cones placed side by side as a clear pair",
    "ket_dressed_adj": "a child fully dressed in shirt, trousers, shoes, and jacket ready to leave home",
    "ket_easy_adj": "a smiling child quickly completing a very simple three-piece picture puzzle",
    "ket_empty_adj": "one completely empty transparent glass beside a full jug for contrast",
    "ket_exciting_adj": "children cheering with thrilled faces on a fast but safe roller coaster",
    "ket_extra_adj": "four apples grouped as two pairs with one additional apple set clearly beside them",
    "ket_fair_adj": "two children receiving exactly equal halves of one cake from an adult",
    "ket_fantastic_adj": "a child gazing joyfully at a magnificent castle surrounded by colorful fireworks",
    "ket_fat_adj": "a friendly round plump cat sitting beside a slimmer cat for gentle visual contrast",
    "ket_final_adj": "a child placing the very last piece into an otherwise complete jigsaw puzzle",
    "ket_fresh_adj": "newly picked colorful vegetables with crisp leaves and water droplets in a clean basket",
    "ket_frightened_adj": "a frightened child recoiling with wide eyes as thunder flashes safely outside a window",
    "ket_full_adj": "a transparent glass filled completely to the brim with orange juice beside an empty bottle",
    "ket_further_adj": "two hikers on one path with the second hiker visibly much farther away in the distance",
    "ket_glad_adj": "a joyful child smiling broadly while welcoming a friend home",
    "ket_gold_n_adj": "a shiny solid gold trophy cup and gold coin on a plain surface with no writing",
    "ket_healthy_adj": "an energetic child holding fresh fruit after exercising in a sunny park",
    "ket_horrible_adj": "a child reacting with disgust to a mouldy sandwich with an unpleasant smell",
    "ket_horror_adj": "a child-safe spooky cinema scene with a shadowy old house, bats, and a glowing moon",
    "ket_huge_adj": "a huge friendly elephant standing beside a tiny cat for strong size contrast",
    "ket_impossible_adj": "a child unable to fit an enormous square block into a tiny round hole",
    "ket_indoor_adj": "children playing a board game inside a cozy living room while rain falls outside",
    "ket_international_adj": "children from many cultures standing together around a globe with several plain national flags",
    "ket_large_adj": "one large suitcase beside a much smaller suitcase for clear size comparison",
    "ket_latest_adj": "a sleek new smartphone beside an old worn phone, both screens blank",
    "ket_lazy_adj": "a child lounging sleepily on a sofa while scattered toys remain untouched on the floor",
    "ket_leather_n_adj": "a brown leather boot and matching leather bag with the natural material texture clearly visible",
    "ket_local_adj": "neighbors greeting a nearby farmer at a small community produce stall, no signs",
    "ket_long_adj": "an extremely long colorful scarf stretched across the floor beside a short scarf",
    "ket_lost_adj": "a worried child alone at a path junction looking around while holding a blank map",
    "ket_loud_adj": "a child covering both ears beside a large ringing bell with strong sound waves",
    "ket_low_adj": "a red ball resting on a very low shelf beneath a second much higher shelf",
    "ket_mad_adj": "an angry child with crossed arms, furrowed eyebrows, and flushed cheeks",
    "ket_metal_n_adj": "a shiny metal spoon, metal bowl, and metal cooking pot reflecting light",
    "ket_missing_adj": "an almost complete jigsaw puzzle with one obvious empty piece-shaped gap",
    "ket_national_adj": "a diverse group of citizens proudly carrying one large plain national flag, no emblem or writing",
    "ket_nervous_adj": "a nervous child waiting beside a small stage with tense shoulders and hands clasped tightly",
    "ket_new_adj": "a shiny new bicycle beside an older scratched bicycle for clear contrast",
    "ket_normal_adj": "an ordinary child following a familiar morning routine of eating breakfast at a plain table",
    "ket_olympic_adj": "international athletes carrying a plain torch beside a winner podium and medals, no numbers or writing",
    "ket_outdoor_adj": "children playing together outside in a sunny green park under an open sky",
    "ket_own_adj": "a child holding their personal blue backpack close while several different backpacks remain on hooks",
    "ket_paper_n_adj": "a stack of plain paper sheets beside a folded paper boat and paper bird",
    "ket_perfect_adj": "a completely finished symmetrical cake with flawless icing and decorations",
    "ket_plastic_n_adj": "a colorful plastic bottle, plastic bowl, and plastic toy with smooth molded surfaces",
    "ket_pleased_adj": "a pleased child smiling proudly while holding a finished clay pot",
    "ket_polite_adj": "a child politely holding a door open for an elderly person to walk through",
    "ket_poor_thing_you_adj": "a caring adult gently comforting a sad child with a small bandage on one knee",
    "ket_popular_adj": "one cheerful child surrounded by many friendly classmates eager to play together",
    "ket_possible_adj": "a child successfully reaching a high toy by safely standing on a sturdy step stool",
    "ket_right_hand_adj": "a child viewed from behind clearly drawing with the right hand while the left hand holds the paper",
    "ket_round_adj": "a round ball, round plate, and round orange arranged together beside one square box",
    "ket_sad_adj": "a sad child sitting alone with lowered head and visible tears",
    "ket_scared_adj": "a scared child stepping backward from a harmless small spider with wide eyes",
    "ket_scary_adj": "a child-safe spooky shadow of a pretend monster cast on a bedroom wall",
    "ket_serious_adj": "a serious focused child sitting upright at a table with a calm unsmiling expression",
    "ket_short_adj": "one very short pencil beside a much longer pencil for clear length contrast",
    "ket_shy_adj": "a shy child partly hiding behind a parent while peeking at a friendly group",
    "ket_similar_adj": "two nearly identical striped socks side by side with only one small color difference",
    "ket_simple_adj": "a very simple tower made from only three large plain blocks",
    "ket_single_adj": "one single red apple displayed alone far from a basket of several apples",
    "ket_slim_adj": "one tall slim vase beside a much wider vase for gentle shape contrast",
    "ket_smart_clever_adj": "a clever child successfully solving a complex three-dimensional shape puzzle",
    "ket_smart_stylish_adj": "a stylish young adult wearing a neat coordinated outfit and polished shoes",
    "ket_spare_adj": "three occupied chairs in a row with one extra empty chair clearly available beside them",
    "ket_successful_adj": "a proud child holding a finished model bridge that stands securely after careful work",
    "ket_surprised_adj": "a child with wide eyes and raised hands reacting to a gift suddenly revealed from a box",
    "ket_surprising_adj": "a colorful toy springing unexpectedly from a plain box while children react with surprise",
    "ket_tasty_adj": "a delighted child enjoying a colorful healthy meal with an eager smile",
    "ket_thin_adj": "one very thin book beside a much thicker book for clear thickness contrast",
    "ket_total_adj_n": "two small groups of apples brought together into one complete combined group",
    "ket_true_adj": "a child comparing a realistic apple picture with the matching real apple beside it",
    "ket_unfortunately_adj": "a sad child watching an ice cream scoop fall from its cone onto the ground",
    "ket_unusual_adj": "one bright striped umbrella displayed among several identical plain umbrellas",
    "ket_upset_adj": "an upset child holding a broken favorite toy with tears in their eyes",
    "ket_usual_adj": "a child calmly following the familiar daily routine of eating breakfast before school",
    "ket_various_adj": "a broad assortment of different fruits, shapes, colors, and sizes arranged together",
    "ket_whole_adj_n": "one complete whole apple beside another apple cut into several slices",
    "ket_wide_adj": "a very wide bridge beside a much narrower footbridge viewed from above",
    "ket_wild_adj": "a wild lion standing freely in an open savanna habitat",
    "ket_wonderful_adj": "a delighted child admiring a beautiful waterfall and bright rainbow in a lush valley",
    "ket_wooden_adj": "a wooden chair, wooden toy blocks, and wooden spoon with visible natural grain",
    "ket_worse_adj": "two damaged umbrellas side by side, with the second visibly more broken than the first",
    "ket_worst_adj": "three apples progressing from fresh to bruised to completely rotten, with the last clearly worst",
}

FEELING_SCENES = {
    "ket_able_adj": "a confident child successfully reaching and placing a book on a high shelf using a safe step stool",
    "ket_afraid_adj": "an afraid child stepping back from a harmless small spider with wide eyes",
    "ket_alone_adj_adv": "one child sitting alone on a park bench with no other people nearby",
    "ket_amazing_adj": "a child gazing in amazement at a huge waterfall beneath a bright rainbow",
    "ket_angry_adj": "an angry child with crossed arms, furrowed eyebrows, and flushed cheeks",
    "ket_beautiful_adj": "a beautiful colorful flower garden in soft morning sunlight",
    "ket_better_adj_adv": "a repaired toy car working well beside the same kind of toy still visibly broken",
    "ket_big_adj": "a big elephant standing beside a tiny mouse for strong size contrast",
    "ket_bored_adj": "a bored child slumped at an empty table with head resting on one hand",
    "ket_boring_adj": "a child yawning during a dull repetitive activity of sorting identical plain blocks",
    "ket_brave_adj": "a brave child calmly helping a frightened kitten down from a very low safe branch",
    "ket_brilliant_adj": "a proud child presenting a complex completed model bridge that works perfectly",
    "ket_busy_adj": "a busy child organizing books, packing a bag, and preparing lunch at the same time",
    "ket_careful_adj": "a careful child slowly carrying a glass filled to the brim with both hands",
    "ket_clear_adj": "one crystal-clear transparent glass beside a cloudy opaque glass for contrast",
    "ket_clever_adj": "a clever child fitting the final difficult piece into a complex shape puzzle",
    "ket_cool_adj_exclam": "friends reacting with admiration as a child performs a safe skateboard trick",
    "ket_different_adj": "one bright red apple placed among a row of identical green apples",
    "ket_difficult_adj": "a child concentrating hard on a complex many-piece three-dimensional puzzle",
    "ket_excellent_adj": "a child proudly holding an exceptionally well-built model beside applauding family",
    "ket_excited_adj": "an excited child jumping happily at the entrance to a colorful amusement park, no signs",
    "ket_famous_adj": "a well-known performer on a stage surrounded by a large cheering audience and cameras",
    "ket_fast_adj_adv": "one runner moving far ahead of several others with clear motion and speed",
    "ket_favourite_adj": "a child choosing and hugging one beloved teddy from among several different toys",
    "ket_fine_adj": "a healthy smiling child giving a thumbs-up after a simple medical check, no writing",
    "ket_free_adj_adv": "a bird flying freely into the open sky from an open cage",
    "ket_funny_adj": "a playful clown making children laugh with a harmless silly hat trick",
    "ket_good_adj": "a fresh healthy apple chosen beside a visibly rotten apple",
    "ket_great_adj": "a child and friends giving enthusiastic thumbs-up to an impressive finished project",
    "ket_happy_adj": "a happy child smiling broadly and raising both arms in a sunny park",
    "ket_hard_adj_adv": "a metal hammer resting against a visibly hard solid rock beside a soft pillow for contrast",
    "ket_heavy_adj": "a child straining to lift a heavy suitcase while a small light bag rests nearby",
    "ket_high_adj": "a red kite flying very high above a second kite close to the ground",
    "ket_hungry_adj": "a hungry child holding an empty plate and gently touching their stomach",
    "ket_important_adj": "a family carefully protecting one essential house key in a small secure box",
    "ket_interested_adj": "an interested child leaning forward closely to examine a colorful science model",
    "ket_interesting_adj": "a fascinating safe science experiment attracting the full attention of several children",
    "ket_kind_adj_n": "a kind child helping an elderly neighbor carry a bag of groceries",
    "ket_lovely_adj": "a lovely friendly kitten sitting among small colorful spring flowers",
    "ket_lucky_adj": "a delighted child discovering a rare four-leaf clover among ordinary clover leaves",
    "ket_modern_adj": "a sleek modern house with large clean windows beside an older traditional cottage",
    "ket_nice_adj": "a friendly child giving a flower to another child with a warm smile",
    "ket_noisy_adj": "a child covering both ears beside drums, a ringing bell, and strong sound waves",
    "ket_old_adj": "an old worn teddy bear with faded fabric beside a clean new teddy bear",
    "ket_poor_adj": "a worried family with an empty coin purse and a very simple meal, treated respectfully",
    "ket_pretty_adj": "a pretty colorful butterfly resting on a bright flower in a garden",
    "ket_quick_adj": "a quick child catching a falling ball just before it reaches the ground",
    "ket_quiet_adj": "children reading silently in a peaceful library with blank book covers",
    "ket_ready_adj": "a child fully ready at the front door wearing shoes and backpack and holding a helmet",
    "ket_real_adj": "a real red apple beside a clearly artificial plastic toy apple",
    "ket_rich_adj": "a wealthy adult in a large home beside a full chest of plain gold coins, no symbols",
    "ket_right_n_adj_adv": "a child placing the one correctly matching shape into a puzzle while other shapes do not fit",
    "ket_slow_adj": "a snail moving slowly along a path far behind a walking child",
    "ket_small_adj": "a very small mouse standing beside a much larger elephant",
    "ket_soft_adj": "a child gently pressing both hands into a fluffy soft pillow",
    "ket_sorry_adj": "an apologetic child returning a broken toy to a friend with hands together and sad eyes",
    "ket_special_adj": "one beautifully decorated gift box displayed among several identical plain boxes",
    "ket_strange_adj": "one unusual upside-down teapot displayed among several ordinary upright teapots",
    "ket_strong_adj": "a strong athlete safely lifting a heavy barbell with controlled posture",
    "ket_sure_adj": "a confident child firmly choosing the matching puzzle piece with a calm thumbs-up",
    "ket_sweet_n_adj": "a small bowl of colorful sweets beside a jar of honey, no labels",
    "ket_tall_adj": "a very tall giraffe standing beside a much shorter goat",
    "ket_terrible_adj": "a child reacting with horror to a completely burnt smoking meal",
    "ket_unhappy_n": "an unhappy child sitting with lowered head, frown, and visible tears",
    "ket_useful_adj": "a useful toolbox open beside several tools actively repairing a toy",
    "ket_worried_adj": "a worried child staring anxiously at a broken toy with hands on their cheeks",
    "ket_wrong_adj": "a child trying to place a clearly mismatched shape into the wrong puzzle hole",
    "ket_young_adj": "a very young toddler standing safely beside a grown adult",
}

BODY_SCENES = {
    "ket_accident_n": "a bicycle lying on its side after a minor accident while an adult helps an unhurt child stand",
    "ket_appointment_n": "a child arriving at a clinic at an arranged time while a doctor waits beside a plain clock",
    "ket_arm_n": "a child raising one bare arm with the complete shoulder, elbow, wrist, and hand clearly visible",
    "ket_baby_n": "a happy baby sitting safely on a soft blanket with a simple toy",
    "ket_back_n_adv_adj": "a person viewed clearly from behind with the whole back visible",
    "ket_beard_n": "a close portrait of a smiling adult man with a full neat beard",
    "ket_blood_n": "one small red drop of blood on a fingertip beside a clean bandage, non-graphic",
    "ket_body_n": "a full standing human figure with head, torso, arms, hands, legs, and feet all visible",
    "ket_brain_n": "a clean child-friendly anatomical model of a human brain on a plain background",
    "ket_break_n_v": "a child with one arm safely supported in a cast after a simple bone break, no injury detail",
    "ket_check_v": "a doctor checking a child's heartbeat with a stethoscope",
    "ket_clean_adj_v": "a child washing both hands with soap until they are visibly clean",
    "ket_cold_adj_n": "a child with a cold resting under a blanket while sneezing into a tissue",
    "ket_comb_n": "one plain hair comb shown clearly beside a small lock of neatly combed hair",
    "ket_cut_v": "a child safely cutting colored paper with blunt round-tipped scissors",
    "ket_danger_n": "an adult stopping a child before a slippery puddle beside a hot cooking area, no warning text",
    "ket_dangerous_adj": "an adult keeping a child safely away from a hot stove and steaming pan",
    "ket_dead_adj": "a completely dead dry plant with brown leaves beside a healthy green plant",
    "ket_dentist_n": "a friendly dentist examining a child's teeth in a bright clean dental clinic",
    "ket_die_v": "a sequence of one green flower gradually wilting and becoming a dry lifeless plant",
    "ket_doctor_n": "a friendly doctor in a plain coat holding a stethoscope in a clinic",
    "ket_dr_n": "a professional doctor wearing a stethoscope and gently greeting a young patient",
    "ket_ear_n": "a clear close side view of one human ear as the main subject",
    "ket_exercise_n_v": "a child exercising with jumping jacks on a safe gym mat",
    "ket_eye_n": "a clear close view of one open human eye with eyelashes and iris visible",
    "ket_face_n": "a front portrait of a smiling child's complete face with eyes, nose, mouth, and ears visible",
    "ket_fall_n_v": "a child safely falling backward onto a thick gym mat while practicing balance",
    "ket_feel_v": "a child using fingertips to feel one fluffy cloth and one rough cloth",
    "ket_finger_n": "a close view of one hand with one index finger clearly extended as the focus",
    "ket_fit_adj": "a healthy fit child jogging energetically in a park after stretching",
    "ket_foot_n": "a clean close side view of one bare human foot with heel, arch, sole, and toes visible",
    "ket_hair_n": "a close portrait focused on a child's healthy long hair being gently brushed",
    "ket_hand_n": "a clean close view of one open human hand with palm, thumb, and five fingers visible",
    "ket_head_n": "a clear portrait of a child's complete head viewed from the side",
    "ket_headache_n": "a child with a headache resting quietly while holding both temples",
    "ket_health_n": "a healthy child combining fresh fruit, clean water, exercise, and restful sleep in one scene",
    "ket_hear_v": "a child cupping one ear and listening carefully to a small ringing bell",
    "ket_heart_n": "a clean child-friendly anatomical model of a human heart on a plain background",
    "ket_hospital_n": "a large modern hospital entrance with doctors, an ambulance, and patients, no signs or writing",
    "ket_hurt_v": "a child grimacing at a lightly scraped knee while an adult applies a clean bandage",
    "ket_ill_adj": "an ill child resting in bed with a tissue and cool cloth while an adult cares for them",
    "ket_leg_n": "a standing child's one complete bare leg from hip through knee and ankle to foot",
    "ket_lie_down_phr_v": "a tired child lying down flat on a bed with head on a pillow",
    "ket_medicine_n": "a plain unlabeled medicine bottle, measuring spoon, and tablets supervised by an adult",
    "ket_mouth_n": "a close view of a smiling open human mouth with lips and teeth clearly visible",
    "ket_neck_n": "a side portrait clearly showing the human neck between head and shoulders",
    "ket_nose_n": "a clear close front view of a human nose as the main focus",
    "ket_nurse_n": "a friendly nurse in a plain uniform caring for a seated child in a clinic",
    "ket_pain_n": "a child showing pain while carefully holding a sore ankle, non-graphic",
    "ket_problem_n": "a child examining a bicycle with a detached wheel and thinking how to repair the problem",
    "ket_rest_n_v": "a tired child resting peacefully in a hammock beneath a tree",
    "ket_run_v": "a child actively running along a safe park path with both feet in motion",
    "ket_sick_adj": "a sick child feeling nauseous while resting in bed beside a bowl and water",
    "ket_soap_n": "one plain bar of soap surrounded by clean white bubbles beside a wash basin",
    "ket_stomach_ache_n": "a child with a stomach ache sitting curled slightly and holding their abdomen",
    "ket_stomach_n": "a clean child-friendly anatomical model of a human stomach on a plain background",
    "ket_swim_v_n": "a child actively swimming freestyle through clear pool water",
    "ket_temperature_n": "a plain clinical thermometer with a high red liquid level and no written scale",
    "ket_tired_adj": "a tired child yawning after exercise while sitting on a bench",
    "ket_toe_n": "a clean close view of one bare foot with the big toe clearly extended as the focus",
    "ket_tooth_n": "one clean white human tooth model shown alone on a plain background",
    "ket_toothache_n": "a child with toothache holding one cheek with a pained expression",
    "ket_toothbrush_n": "one plain toothbrush with a small amount of toothpaste beside a clean cup",
    "ket_walk_v_n": "a child walking naturally along a park path with one foot stepping forward",
    "ket_well_adv_adj": "a recovered healthy child smiling and giving a thumbs-up after resting",
}

SCHOOL_SCENES = {
    "ket_advanced_adj": "an experienced student confidently assembling a complex working robot while a beginner uses simple blocks",
    "ket_beginner_n": "a beginner learning the first simple piano hand position from a patient teacher",
    "ket_blackboard_n": "one large clean blackboard with a chalk tray and eraser, completely blank",
    "ket_board_n": "a teacher pointing to a large completely blank classroom board",
    "ket_book_n_v": "one open book with plain blank pages beside a closed book with no title",
    "ket_class_n": "a complete class of children seated together while a teacher demonstrates a globe",
    "ket_classroom_n": "a bright classroom with rows of desks, chairs, a blank board, and learning materials",
    "ket_coach_n": "a sports coach demonstrating a safe stretching exercise to a group of young athletes",
    "ket_course_n": "one student progressing through connected art, science, and computer learning sessions",
    "ket_examination_exam_n": "students quietly completing an examination at separate desks with blank papers and a plain clock",
    "ket_history_n": "children studying old pottery, a model castle, and historical clothing in a museum",
    "ket_homework_n": "a child completing schoolwork at a desk at home with blank paper and books",
    "ket_idea_n": "a child suddenly imagining and beginning to build a creative model bridge from blocks",
    "ket_information_n": "a child gathering information by examining picture cards, a globe, and a blank map",
    "ket_instructions_n_pl": "a teacher demonstrating three clear building steps with blocks while a child follows",
    "ket_know_v": "a confident child raising one hand because they know the answer while the teacher holds an object",
    "ket_language_n": "two children from different countries speaking together with plain country flags nearby, no writing",
    "ket_learn_v": "a child watching a teacher demonstrate a science model and then trying the same task",
    "ket_lesson_n": "a teacher giving a focused lesson about the globe to seated students",
    "ket_level_n": "a learner progressing upward through three increasingly difficult block-building stages",
    "ket_library_n": "a spacious library with tall bookshelves, reading tables, and children reading quietly",
    "ket_mark_n": "a teacher reviewing a blank worksheet and placing one simple green tick mark beside a correct picture",
    "ket_memory_n": "a child successfully matching pairs of picture cards after remembering where each hidden picture was",
    "ket_mistake_n": "a child noticing one wrongly placed puzzle piece and carefully replacing it with the correct shape",
    "ket_note_n_v": "a child placing one small blank reminder note beside a school bag before leaving",
    "ket_number_n": "a child counting several clear groups of colorful beads with no written digits",
    "ket_pen_n": "one plain ink pen shown clearly on a clean desk with no logo",
    "ket_pencil_case_n": "one open pencil case containing pencils, an eraser, and a ruler, all without writing",
    "ket_pencil_n": "one sharpened yellow pencil shown clearly on a plain surface with no writing",
    "ket_practise_v": "a child repeatedly practising the same piano hand movement while a teacher encourages them",
    "ket_project_n": "several students working together to build a detailed model volcano project",
    "ket_pupil_n": "one young pupil seated attentively at a classroom desk facing a teacher",
    "ket_question_n": "a puzzled child raising one hand to ask a teacher about an object, no speech bubble",
    "ket_read_v": "a child quietly reading an open picture book with no visible writing",
    "ket_reading_n": "several children enjoying reading picture books together in a library corner",
    "ket_remember_v": "a child suddenly remembering and picking up a forgotten backpack beside the front door",
    "ket_rubber_n": "one plain rectangular pencil eraser beside faint erased pencil marks, no writing",
    "ket_ruler_n": "one plain wooden ruler with simple measurement ticks but no written numbers",
    "ket_school_n": "a complete school building with children arriving, classrooms visible, and no sign",
    "ket_science_n": "children conducting a safe science experiment with plants, magnets, and glassware",
    "ket_sentence_n": "three picture cards arranged in order showing a child, kicking, and a ball as one complete idea",
    "ket_spelling_n": "a child slowly saying separate sounds while a teacher listens and counts on fingers, no letters",
    "ket_student_n": "one older student studying attentively at a desk with blank books and a laptop",
    "ket_studies_n_pl": "a student working across several subjects using a globe, science model, and art materials",
    "ket_study_v": "a focused student studying at a desk with a blank book, lamp, and globe",
    "ket_subject_n": "separate school subject objects together: globe, paintbrush, magnet, ball, and music notes",
    "ket_teach_v": "a teacher actively showing a child how to assemble a simple science model",
    "ket_teacher_n": "one friendly teacher standing before a class and holding a globe",
    "ket_term_n": "three connected classroom scenes across autumn, winter, and spring showing parts of a school year",
    "ket_test_n": "a student quietly taking a test at a separate desk with blank paper and a plain clock",
    "ket_timetable_n": "a weekly timetable grid filled only with clear picture icons for subjects, no words or numbers",
    "ket_university_n": "a large university campus with lecture buildings and young adult students, no signs",
    "ket_writing_n": "a close view of a hand writing neat short lines with a pen on plain paper, no readable letters",
}

ENTERTAINMENT_SCENES = {
    "ket_act_v": "a child acting out a dramatic scene on a small stage while friends watch",
    "ket_actor_n": "one actor in a plain costume performing a clear role under stage lights",
    "ket_adventure_n": "children on a safe adventurous forest hike crossing a small bridge toward a waterfall",
    "ket_art_n": "a display of colorful paintings, pottery, and sculpture in a bright art studio",
    "ket_balloon_n": "one large colorful balloon floating on a string against a plain background",
    "ket_band_n": "a band of four musicians playing guitar, keyboard, drums, and bass together",
    "ket_board_game_n": "children playing a colorful board game with plain pieces and no writing",
    "ket_cartoon_n": "a television showing a cheerful animated animal character with no captions or interface",
    "ket_chess_n": "two children playing chess on a complete black-and-white chessboard",
    "ket_cinema_n": "an audience seated in a cinema watching a large screen showing a simple nature scene, no text",
    "ket_circus_n": "a child-safe circus performance with acrobats, a juggler, and a clown under a bright tent",
    "ket_clown_n": "one friendly clown in a colorful costume juggling three plain balls",
    "ket_competition_n": "two teams competing to build the tallest block tower while a judge watches",
    "ket_concert_n": "a live concert with musicians performing on stage before a cheering audience",
    "ket_dance_n_v": "two children actively dancing together to music on a clear floor",
    "ket_disco_n": "people dancing beneath a mirror ball and colorful lights in a safe disco",
    "ket_draw_v": "a child actively drawing a flower with a pencil on blank paper",
    "ket_drawing_n": "one finished pencil drawing of a flower displayed beside the pencil",
    "ket_drum_n": "one complete drum with two drumsticks shown clearly on a plain background",
    "ket_exhibition_n": "visitors viewing paintings, pottery, and sculpture arranged in an exhibition gallery, no labels",
    "ket_festival_n": "a joyful outdoor festival with music, dancing, lanterns, and food stalls, no signs",
    "ket_film_n_v": "a camera crew filming an actor performing a scene, with no clapperboard text",
    "ket_fun_adj_n": "children laughing and having fun together on swings and a slide",
    "ket_go_out_phr_v": "friends leaving home together in the evening to visit a cinema, no signs",
    "ket_guitar_n": "one plain acoustic guitar shown clearly with strings and sound hole, no logo",
    "ket_instrument_n": "a collection of musical instruments including guitar, violin, trumpet, drum, and flute",
    "ket_jazz_n": "a jazz trio playing saxophone, upright bass, and piano together on a small stage",
    "ket_keyboard_n": "one electronic music keyboard with black and white keys and no labels",
    "ket_laugh_v": "two children laughing openly together at a harmless funny puppet",
    "ket_listen_to_v": "a child listening closely to music through plain headphones with eyes closed",
    "ket_look_at_phr_v": "a child standing still and looking carefully at a colorful painting in a gallery",
    "ket_model_n": "a child holding a detailed scale model airplane beside modelling tools",
    "ket_museum_n": "a museum interior with dinosaur skeleton, ancient pottery, and visitors, no labels",
    "ket_music_n": "musical notes floating around a guitar, piano, violin, and drum with no writing",
    "ket_musician_n": "one musician actively playing a guitar on a small stage",
    "ket_news_n": "a television news presenter reporting from a studio with a plain world map and no text",
    "ket_opera_n": "an opera singer in costume performing on a grand stage with an orchestra below",
    "ket_paint_v_n": "a child actively painting colorful flowers on a blank canvas with a brush and palette",
    "ket_performance_entertainment_n": "performers singing, dancing, and playing music on stage before an audience",
    "ket_photo_graph_n": "one printed photograph of a family in a park with a plain white border",
    "ket_photographer_n": "a photographer using a camera to take a portrait of a family in a park",
    "ket_piano_n": "one complete black grand piano with keyboard and open lid, no logo",
    "ket_picture_n": "one framed colorful picture of a mountain landscape on a plain wall",
    "ket_play_v_n": "children actively playing a board game together and smiling",
    "ket_pop_n": "a modern pop band singing and playing bright instruments on stage",
    "ket_programme_n": "a family watching one television programme showing a nature documentary with no interface",
    "ket_rap_n": "a rap performer rhythmically speaking into a microphone while making expressive hand gestures",
    "ket_rock_n": "a rock band playing electric guitars and drums energetically on stage, no logos",
    "ket_screen_n": "one large blank television screen shown clearly with no interface or writing",
    "ket_show_v_n": "a stage show with a presenter revealing a magic trick to an audience",
    "ket_sing_v": "a child actively singing into a microphone with mouth open and music notes nearby",
    "ket_singer_n": "one singer performing into a microphone under a stage spotlight",
    "ket_song_n": "a singer performing one melody with flowing music notes and guitar accompaniment",
    "ket_story_n": "an adult telling a picture story to children gathered around, no readable text",
    "ket_tune_music_n": "a musician playing a short clear melody on a flute with flowing music notes",
    "ket_video_game_n": "a child playing a colorful video game with controller and a screen containing no text",
    "ket_violin_n": "one complete wooden violin with four strings and bow on a plain background",
}

TRANSPORT_SCENES = {
    "ket_aeroplane_n": "one complete passenger aeroplane viewed clearly from the side on a runway, no logos or numbers",
    "ket_bus_n": "one city bus viewed clearly from the side with blank destination display and no numbers",
    "ket_car_n": "one simple family car viewed clearly from the side with blank number plates",
    "ket_case_n": "one small hard travel case with handle and closed latches, no labels",
    "ket_delay_n_v": "a stationary train beside waiting passengers and a plain clock showing that departure is delayed",
    "ket_delayed_adj": "tired passengers still waiting beside a stationary bus as daylight fades, no signs",
    "ket_drive_v": "an adult safely driving a car with both hands on the steering wheel",
    "ket_driver_n": "one driver seated behind the steering wheel of a bus, viewed through the front window",
    "ket_engine_n": "one complete car engine outside a vehicle with major mechanical parts clearly visible",
    "ket_engineer_n": "a transport engineer inspecting a large vehicle engine with tools and safety clothing",
    "ket_far_adv": "a car travelling on a road toward very distant mountains, shown tiny far away",
    "ket_flight_n": "a passenger aeroplane taking off into the sky while travellers watch from the terminal window",
    "ket_fly_v": "an aeroplane actively flying high through clouds with wings level",
    "ket_harbour_n": "a sheltered harbour filled with small boats tied to docks and a lighthouse, no signs",
    "ket_helicopter_n": "one complete helicopter hovering safely above an open field, no logos or numbers",
    "ket_journey_n": "a family making a long journey by car along a winding road from town to mountains",
    "ket_leave_v": "a traveller waving goodbye while boarding a departing train with luggage",
    "ket_left_adj_adv_n": "a car turning left at a clear road fork while the right branch remains empty, no signs",
    "ket_lorry_n": "one large delivery lorry viewed clearly from the side with a blank cargo box",
    "ket_luggage_n": "several suitcases and travel bags grouped together beside an airport trolley, no tags",
    "ket_machine_n": "one large working mechanical machine with gears, belts, and moving parts, no labels",
    "ket_map_n": "one illustrated road map with rivers, roads, mountains, and landmarks but no place names",
    "ket_mirror_n": "one car side mirror reflecting the road behind with no writing",
    "ket_motorbike_n": "one complete plain motorbike viewed clearly from the side, no logos or plate numbers",
    "ket_move_v": "a moving van carrying boxes away from one house while helpers load the last box",
    "ket_passenger_n": "one passenger seated inside a bus beside luggage while a separate driver is visible",
    "ket_pilot_n": "one aeroplane pilot seated in a cockpit holding the controls, no screen text",
    "ket_plane_n": "one passenger plane flying across a clear blue sky with no logos or numbers",
    "ket_platform_n": "a railway platform beside a waiting train with passengers and benches, no signs or numbers",
    "ket_police_car_n": "one blank police car with red and blue roof lights beside two uniformed officers, no text or emblems",
    "ket_port_n": "a busy sea port with cargo ships, cranes, containers, and docks, no signs",
    "ket_repair_v": "a mechanic actively repairing a car wheel with tools while the car is safely raised",
    "ket_return_n_v": "a traveller returning home with a suitcase while family warmly welcomes them at the door",
    "ket_scooter_n": "one simple two-wheeled kick scooter shown clearly from the side, no logo",
    "ket_seat_n": "one empty padded passenger seat inside a train with the window beside it",
    "ket_ship_n": "one large passenger ship sailing across open water with no name or logo",
    "ket_site_n": "tourists visiting a clearly defined ancient castle site with paths and ruins, no signs",
    "ket_stop_n_v": "a moving car coming to a complete stop before a pedestrian crossing",
    "ket_suitcase_n": "one upright rolling suitcase with handle and wheels shown clearly, no tags",
    "ket_taxi_n": "one yellow taxi with a plain blank roof light and no writing or plate numbers",
    "ket_tour_n": "a small tour group following a guide past several city landmarks, no signs",
    "ket_tourist_n": "one tourist carrying a camera and blank map while looking at a landmark",
    "ket_traffic_light_n": "one complete traffic light showing red, amber, and green lenses, no signs",
    "ket_traffic_n": "many cars, buses, and bicycles moving closely along a busy city road, no signs",
    "ket_train_n": "one complete passenger train travelling along railway tracks, no numbers or logos",
    "ket_tram_n": "one city tram running on street rails beneath overhead wires, no route text",
    "ket_transport_n": "several forms of transport together: bus, train, bicycle, car, ship, and aeroplane",
    "ket_travel_v": "a family travelling with luggage by train while countryside passes outside",
    "ket_trip_n": "a family taking a day trip by car to a scenic lake with picnic bags",
    "ket_visit_n": "a friendly visit with guests arriving at a family home and being welcomed inside",
    "ket_visit_v": "a family actively visiting grandparents and greeting them at their home",
    "ket_visitor_n": "one visitor arriving at a museum entrance with camera and blank map",
    "ket_way_n": "a clear winding path showing the way from a house to a distant bridge, no signs",
    "ket_wheel_n": "one complete vehicle wheel with tyre, rim, hub, and spokes shown clearly",
    "ket_window_n": "one large train window showing moving countryside outside from a passenger seat",
}

DIGITAL_SCENES = {
    "ket_at_prep": "one email travelling from a sender's laptop to one specific recipient's laptop, all screens blank",
    "ket_call_n_v": "a child making a phone call with a plain smartphone held to one ear",
    "ket_chat_n": "two friends chatting live through plain tablets showing each other's faces with no text",
    "ket_click_n_v": "a close hand pressing a computer mouse button beside a blank monitor",
    "ket_conversation_n": "two people having an engaged face-to-face conversation with clear listening gestures",
    "ket_digital_adj": "a collection of digital devices with colorful pixel-like images on blank screens",
    "ket_dot_n": "one small solid colored round dot centered alone on a plain white surface",
    "ket_envelope_n": "one sealed blank paper envelope shown clearly from the front with no address",
    "ket_file_n": "one plain digital file folder icon displayed beside a laptop with no text",
    "ket_headphones_n": "one complete pair of over-ear headphones shown clearly on a plain background",
    "ket_internet_n": "a globe connected by glowing lines to several blank computers and phones around it",
    "ket_it_n": "an information technology worker repairing several computers and network devices",
    "ket_link_technology_n": "two digital devices visibly connected by a glowing chain of linked nodes",
    "ket_microphone_n": "one plain studio microphone on a stand shown clearly with no logo",
    "ket_mouse_n": "one plain computer mouse with cable shown beside a blank keyboard",
    "ket_net_n": "a mesh-like digital network connecting many devices around a globe",
    "ket_printer_n": "one home printer producing a page with a simple flower picture and no writing",
    "ket_program_n": "a computer screen showing a visual program made only of connected colored blocks, no text",
    "ket_selfie_n": "friends holding a phone toward themselves and taking a cheerful selfie",
    "ket_speaker_n": "one plain audio speaker playing music with curved sound waves, no logo",
    "ket_tablet_n": "one slim touchscreen tablet with a blank colorful screen, no interface or logo",
    "ket_talk_n_v": "two friends talking animatedly face to face with natural hand gestures",
    "ket_text_message_n": "a phone sending several blank message bubbles to a friend's phone, no letters",
    "ket_web_n": "a globe surrounded by an interconnected web of glowing digital lines and devices",
    "ket_website_n": "the same blank web page layout displayed across laptop, tablet, and phone with no text",
}

SHOPPING_SCENES = {
    "ket_assistant_n": "a helpful store assistant handing a product to a customer at a plain counter",
    "ket_buy_v": "a customer buying a toy by giving coins to a cashier and receiving the toy",
    "ket_cash_n_v": "a small group of plain banknotes and coins arranged beside an open cash drawer, no numbers",
    "ket_cent_n": "one small copper coin displayed beside several larger coins, with no symbol or number",
    "ket_change_v_n": "a cashier returning several small coins as change to a customer after a purchase",
    "ket_cheap_adj": "two similar toys with one requiring only one small coin and the other a large pile of coins",
    "ket_cheque_n": "one blank bank cheque shape with signature line and boxes but no readable writing",
    "ket_close_adj_v": "a shop worker actively closing the front doors and pulling down a plain shutter",
    "ket_closed_adj": "a shop with doors shut, lights off, and a fully lowered plain shutter, no sign",
    "ket_cost_n_v": "a customer counting a pile of coins needed to receive one product from a cashier",
    "ket_credit_card_n": "one plain blank credit card beside a payment terminal, no numbers or logo",
    "ket_euro_n": "a group of European-style gold and silver coins with all symbols and numbers omitted",
    "ket_expensive_adj": "a luxury watch requiring a very large pile of coins while a simple watch needs only one coin",
    "ket_for_sale_n": "a seller presenting a bicycle to an interested buyer with a handshake, no signs",
    "ket_money_n": "an assortment of plain banknotes and coins with all numbers and symbols omitted",
    "ket_open_adj_v": "a shop worker actively opening wide front doors as customers approach",
    "ket_pair_n": "one matching pair of shoes displayed side by side",
    "ket_pay_v": "a customer paying a cashier with a plain card while receiving a shopping bag",
    "ket_pence_n": "several small British-style copper coins with all numbers and symbols omitted",
    "ket_penny_n": "one small copper penny-style coin shown clearly with no visible symbol or number",
    "ket_pound_n": "one large British-style coin and a plain banknote with all writing and symbols omitted",
    "ket_price_n": "a product beside the exact pile of coins required to buy it, no written price tag",
    "ket_receipt_n": "a cash register printing a long narrow blank receipt with no readable writing",
    "ket_rent_v": "a customer temporarily receiving a bicycle and key from a rental worker beside a plain clock",
    "ket_sale_n": "many shoppers choosing reduced-price clothes from a special rack, no sale signs",
    "ket_shopping_n": "a shopper selecting groceries into a cart in a bright store aisle, no signs",
    "ket_size_n": "the same shirt displayed in three clearly different sizes from small to large",
    "ket_spend_v": "a shopper handing over several coins to purchase groceries at a counter",
    "ket_store_n": "a complete general store interior with shelves, products, checkout, and customers, no signs",
}

DOCUMENT_SCENES = {
    "ket_ad_n": "a small digital advertisement panel showing one product picture and colorful shapes, no writing",
    "ket_advert_n": "a newspaper advertisement box containing a product picture and blank grey lines, no letters",
    "ket_advertisement_n": "a large billboard advertisement showing a shoe and colorful shapes with no words",
    "ket_album_n": "an open photo album filled with family photographs and no captions",
    "ket_bill_n": "a restaurant bill represented by a narrow blank paper beside meal icons and coins",
    "ket_card_n": "one folded greeting card with a flower picture and completely blank inside",
    "ket_comic_n": "a comic page with several sequential picture panels and no speech bubbles or writing",
    "ket_details_n": "a magnifying glass examining small picture icons and blank lines on a document",
    "ket_diary_n": "a small personal diary with a plain lock, ribbon, and completely blank cover",
    "ket_document_n": "one formal document with blank lines, boxes, and a plain embossed seal, no writing",
    "ket_email_n_v": "an envelope icon travelling from one blank laptop screen to another, no text",
    "ket_folder_n": "one open paper folder holding several blank documents with no labels",
    "ket_form_n": "one blank form with empty boxes and lines ready to fill, no letters or numbers",
    "ket_id_card_n": "one blank identity card with a portrait photo and colored fields but no writing or numbers",
    "ket_id_n": "a person presenting a blank identity card with portrait photo to an official",
    "ket_invitation_n": "one decorative invitation card with balloons and flowers but no writing",
    "ket_letter_n": "a blank personal letter sheet being placed into a plain envelope, no writing",
    "ket_licence_n": "one blank driving licence card with portrait and car picture but no writing or numbers",
    "ket_line_n": "one single straight horizontal line centered on a plain white page",
    "ket_list_n": "a vertical list of picture icons with empty check boxes and no words",
    "ket_magazine_n": "one glossy magazine with a large nature photograph on the cover and no title",
    "ket_mail_n": "several sealed blank envelopes being delivered into a mailbox",
    "ket_message_n_v": "one blank message bubble travelling between two plain phones with no letters",
    "ket_newspaper_n": "one folded newspaper with photo panels and grey line columns but no readable print",
    "ket_notebook_n": "one spiral notebook open to clean blank lined pages with no writing",
    "ket_notice_n": "a public notice board displaying one large picture instruction with no words",
    "ket_page_n": "one single blank page being turned in an open book",
    "ket_passport_n": "one plain passport-style booklet with a globe emblem and no letters or numbers",
    "ket_postcard_n": "one scenic postcard showing mountains on the front and a completely blank back",
    "ket_poster_n": "one colorful poster with a large animal picture and decorative shapes but no text",
    "ket_sign_n": "one blank directional signboard beside a path with no letters or symbols",
    "ket_stamp_n": "one postage stamp with a flower picture and perforated edges, no number or writing",
    "ket_text_n_v": "a page layout made of neat grey line blocks representing text without readable characters",
    "ket_textbook_n": "one thick school textbook with science picture icons and a completely blank cover",
    "ket_ticket_n": "one blank travel ticket with a small train picture and perforated edge, no numbers",
    "ket_title_n": "a child pointing to the large blank top area of a book cover where a title belongs",
}

HOBBY_SCENES = {
    "ket_beach_n": "a wide sandy beach with gentle sea waves, umbrellas, sandcastle, and families relaxing",
    "ket_bicycle_n": "one complete plain bicycle viewed clearly from the side with no logo",
    "ket_bike_n": "one child riding a plain bicycle safely along a park path with a helmet",
    "ket_camp_v": "a family actively setting up a tent to camp beside a lake",
    "ket_camping_n": "a family enjoying camping with tents, sleeping bags, and a safe small campfire",
    "ket_campsite_n": "a complete campsite with several tents, picnic tables, trees, and a safe fire area",
    "ket_climbing_n": "a helmeted child climbing an indoor wall with a safety harness",
    "ket_club_n": "a hobby club of children meeting regularly to build model airplanes together",
    "ket_collect_v": "a child collecting colorful stones into a neatly arranged display box",
    "ket_cooking_n": "a child cooking a simple meal with an adult in a safe kitchen",
    "ket_cycling_n": "several helmeted cyclists riding bicycles together along a countryside path",
    "ket_dancing_n": "a group of children enjoying dancing together in a bright studio",
    "ket_ice_skating_n": "a child wearing ice skates gliding across a frozen rink",
    "ket_join_v": "one child stepping into a circle to join friends doing a shared craft activity",
    "ket_kite_n": "one colorful diamond-shaped kite flying in a blue sky on a long string",
    "ket_member_n": "one club member wearing the same plain colored shirt as the rest of a hobby group",
    "ket_painting_n": "one finished colorful painting of flowers displayed on an easel",
    "ket_park_n_v": "families relaxing in a green public park while one car is parked neatly nearby",
    "ket_party_n": "children enjoying a birthday party with cake, balloons, and games, no writing",
    "ket_quiz_n": "two teams answering a picture quiz by choosing matching objects, no words or numbers",
    "ket_running_n": "several people running for leisure along a safe park path",
    "ket_singing_n": "a group of children singing together into plain microphones with music notes",
    "ket_skateboarding_n": "a helmeted child skateboarding safely on a smooth skate park ramp",
    "ket_skating_n": "children wearing roller skates and skating together on a safe smooth rink",
    "ket_surfing_n": "a surfer riding a medium ocean wave on a plain surfboard",
    "ket_tent_n": "one complete camping tent pitched securely on grass with the entrance open",
    "ket_walking_n": "friends walking for leisure together along a scenic countryside trail",
}

MANNER_DEGREE_SCENES = {
    "ket_actually_adv": "a child discovering that a box expected to be empty actually contains a colorful toy",
    "ket_ago_adv": "an older child looking at a framed baby photo of themself from long ago, no writing",
    "ket_almost_adv": "a rolling ball stopping just one tiny step before crossing a finish ribbon",
    "ket_also_adv": "one child placing an apple in a basket and a second child adding another apple too",
    "ket_anymore_adv": "a child walking past a dusty outgrown tricycle without using it now",
    "ket_anyway_adv": "a child continuing cheerfully along a path with an umbrella despite heavy rain",
    "ket_anywhere_adv": "a traveler with a backpack free to choose among many open paths through varied landscapes",
    "ket_as_well_adv": "two children each adding one matching flower to the same vase",
    "ket_away_adv": "a child walking farther and farther away from a small house in the distance",
    "ket_badly_adv": "a child doing a very messy painting with spilled paint and uneven brush strokes",
    "ket_best_adj_adv": "three handmade cakes with one beautifully finished cake wearing a plain prize ribbon",
    "ket_bit_n_adv": "a tiny spoon holding just a small bit of food beside a full bowl",
    "ket_carefully_adv": "a child carefully carrying a glass filled to the brim with both hands",
    "ket_certainly_adv": "a confident child nodding firmly and giving a clear thumbs-up",
    "ket_clearly_adv": "a magnifying glass showing one butterfly in crisp detail against a softly blurred garden",
    "ket_easily_adv": "a smiling child fitting the final large piece into a very simple wooden puzzle",
    "ket_else_adv": "a child setting one toy aside and choosing a different toy from a basket",
    "ket_especially_adv": "one favorite strawberry highlighted at the center of a bowl of mixed fruit",
    "ket_even_adv": "two identical baskets perfectly balanced on a level scale",
    "ket_everywhere_adv": "colorful butterflies spread across every part of a wide flower garden",
    "ket_exactly_adv": "one uniquely shaped puzzle piece fitting perfectly into its matching space",
    "ket_finally_adv": "a tired but joyful hiker finally reaching the top of a long mountain trail",
    "ket_here_adv": "a child pointing clearly to a spot on the ground right beside their feet",
    "ket_how_adv": "a child watching closely as an adult demonstrates the steps for building a toy",
    "ket_however_adv": "a picnic beginning in sunshine while a sudden rain cloud makes the family open umbrellas",
    "ket_immediately_adv": "a child instantly reaching out to catch a cup the moment it begins to fall",
    "ket_indoors_adv": "children playing a board game inside a cozy room while rain falls outside the window",
    "ket_instead_adv": "a child pushing candy aside and choosing a fresh apple instead",
    "ket_least_adv": "three clear bowls of marbles with one bowl holding only a single marble",
    "ket_luckily_adv": "a child safely reaching a covered shelter just as a heavy rain shower begins",
    "ket_maybe_adv": "an undecided child holding sunglasses and an umbrella under a sky that is half sunny and half cloudy",
    "ket_nearly_adv": "a glass nearly full of juice with only a tiny empty space at the top",
    "ket_next_adj_adv": "a child waiting directly behind another child as the next person in line",
    "ket_not_adv": "a child firmly shaking their head and refusing an offered plate of unwanted food",
    "ket_off_adv": "a hand pressing a switch while a nearby lamp becomes dark and unlit",
    "ket_only_adv_adj": "one single red apple sitting alone on an otherwise empty table",
    "ket_out_adv": "a child stepping out through an open front door from inside the house",
    "ket_outdoors_adv": "a family enjoying games and a picnic outdoors in a sunny green field",
    "ket_perhaps_adv": "a thoughtful child considering whether a small seed might grow into the imagined flower above it",
    "ket_possibly_adv": "a child looking at a narrow but passable path across a shallow stream as one possible route",
    "ket_probably_adv": "a child confidently taking an umbrella before leaving because dark rain clouds fill the sky",
    "ket_quickly_adv": "a child running quickly to catch a bus with strong motion in their legs and clothes",
    "ket_quite_adv": "a glass that is noticeably but not completely full, about three quarters filled with juice",
    "ket_really_adv": "a delighted child gently touching a real rabbit beside a clearly artificial stuffed rabbit",
    "ket_recently_adv": "a child beside a freshly painted chair with a wet brush and still-shiny paint",
    "ket_slowly_adv": "a child walking very slowly beside a turtle along a quiet path",
    "ket_somewhere_adv": "a child searching boxes while a partly hidden teddy bear is somewhere in the room",
    "ket_straight_adj_adv": "a long perfectly straight road continuing directly toward the horizon",
    "ket_suddenly_adv": "a balloon suddenly bursting beside a startled child, captured at the instant of the pop",
    "ket_there_adv": "a child pointing toward one specific tree far across a field",
    "ket_together_adv": "two children working together to carry one large box",
    "ket_too_adv": "a child pouring too much juice so the full glass overflows onto the table",
    "ket_upstairs_adv": "a child climbing a staircase toward a clearly visible upper floor",
    "ket_very_adv": "a child wrapped in many scarves and shivering intensely in deep snow",
    "ket_when_adv": "a child watching a clock and putting on a backpack at the moment it is time to leave",
    "ket_where_adv": "a child studying a picture map and searching for the correct destination, no labels",
    "ket_why_adv": "a curious child examining the separated pieces of a broken toy to discover the cause",
}

PREPOSITION_DIRECTION_SCENES = {
    "ket_about_adv_prep": "two children having a lively conversation about a globe placed between them, no speech text",
    "ket_above_adv_prep": "one red ball floating clearly above a blue wooden box with open space between them",
    "ket_across_adv_prep": "a child walking from one side to the other across a small footbridge",
    "ket_after_adv_prep": "two children in a clear line with the second child standing directly after the first",
    "ket_against_prep": "a wooden ladder leaning firmly against a plain brick wall",
    "ket_along_prep": "a child riding a bicycle along a winding riverside path",
    "ket_among_prep": "one red apple placed among a large group of green apples",
    "ket_around_adv_prep": "four children sitting in a complete circle around a round table",
    "ket_as_conj_adv_prep": "a child dressed and acting as a doctor while gently checking a teddy bear",
    "ket_as_well_as_prep": "a child carrying a banana as well as an apple, one fruit in each hand",
    "ket_at_all_prep_phr": "a child trying to move a heavy box that has not moved at all from its marked floor position",
    "ket_at_prep_2": "a child seated directly at a dining table with a plate in front",
    "ket_because_of_prep_phr": "a family moving their picnic under a shelter because of sudden heavy rain",
    "ket_before_adv_conj_prep": "two children in a clear line with one child standing directly before the other",
    "ket_behind_adv_prep": "a red ball partly hidden behind a blue wooden box",
    "ket_below_adv_prep": "a red ball positioned clearly below a high wooden shelf",
    "ket_beside_prep": "a red ball resting beside a blue wooden box with a small gap",
    "ket_between_prep": "one red ball centered exactly between two blue wooden boxes",
    "ket_by_accident_prep_phr": "a surprised child accidentally knocking over a glass of juice with an elbow",
    "ket_by_prep": "a child standing close by the side of a large tree",
    "ket_by_the_way_prep_phr": "two children talking while one suddenly remembers and points toward a bicycle nearby",
    "ket_close_to_prep_phr": "a red ball extremely close to a blue wooden box but not touching it",
    "ket_down_adv_prep": "a child carefully walking down a staircase toward the lower floor",
    "ket_during_prep": "children quietly eating snacks during a movie shown on a blank glowing screen",
    "ket_except_conj_prep": "many green apples grouped together except one orange placed alone outside the group",
    "ket_for_prep": "a child giving a wrapped present to a delighted friend",
    "ket_from_prep": "a red ball rolling away from a blue wooden box toward a waiting child",
    "ket_in_adv_prep": "one red ball resting visibly in an open blue wooden box",
    "ket_in_front_of_prep_phr": "one red ball positioned clearly in front of a blue wooden box",
    "ket_including_prep": "a fruit basket containing several apples and including one clearly visible banana",
    "ket_inside_adv_prep": "a small cat sitting completely inside an open cardboard box",
    "ket_instead_of_prep": "a child pushing candy aside and choosing a fresh apple instead",
    "ket_into_prep": "a red ball captured moving into the open top of a blue wooden box",
    "ket_like_adv_prep_v": "a child and parent who look alike wearing matching plain clothes and making the same pose",
    "ket_minus_prep": "five wooden blocks together while one block is visibly being removed from the group, no numbers",
    "ket_near_adv_prep": "a red ball near a blue wooden box with a short visible distance between them",
    "ket_next_to_prep": "a red ball directly next to a blue wooden box, side by side",
    "ket_of_prep": "a clear cup full of water centered on a plain table",
    "ket_on_prep_adv": "one red ball resting securely on top of a blue wooden box",
    "ket_opposite_prep": "two children seated opposite each other across a small table",
    "ket_out_of_prep": "a small cat captured jumping out of an open cardboard box",
    "ket_outside_prep_adv": "a small cat sitting outside a closed cardboard box",
    "ket_over_prep_adv": "a bright bird flying over the roof of a small house",
    "ket_per_prep": "three children each receiving exactly one apple, one apple per child",
    "ket_plus_prep": "two apples together while a hand adds one more apple to the group, no numbers or symbols",
    "ket_since_prep": "the same person shown growing from a small baby into a school-age child over time, no labels",
    "ket_than_prep_conj": "two children standing side by side with one clearly taller than the other",
    "ket_through_prep": "a child walking all the way through a short open tunnel",
    "ket_till_prep": "a child waiting patiently beside a covered dish until it is time to eat",
    "ket_to_prep": "a child walking directly toward a small house as the destination",
    "ket_under_prep": "one red ball resting clearly under a wooden table",
    "ket_until_prep": "a child waiting beside an oven until a cake is ready, watching a plain analog clock",
    "ket_up_prep_adv": "a child climbing up a staircase toward the upper floor",
    "ket_with_prep": "a child walking happily with a friendly dog beside them",
    "ket_without_prep": "a wet child standing in heavy rain without an umbrella",
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


def select_words(
    words: list[dict[str, Any]],
    accepted_ids: set[str],
    category: str | None,
    offset: int,
    limit: int,
) -> list[dict[str, Any]]:
    candidates = [
        word
        for word in words
        if word["id"] not in accepted_ids
        and (category is None or word.get("category") == category)
    ]
    candidates.sort(key=lambda word: word["id"])
    return candidates[offset : offset + limit]


def load_processed_ids(path: Path) -> set[str]:
    if not path.exists():
        return set()
    manifest = json.loads(path.read_text(encoding="utf-8"))
    accepted_ids = {
        record["wordId"]
        for record in manifest.get("images", [])
        if record.get("status") == "accepted"
    }
    reviewed_ids = {
        record["wordId"]
        for record in manifest.get("reviews", [])
        if record.get("status") in {"ACCEPT", "REJECT"}
    }
    return accepted_ids | reviewed_ids


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
        "ambulance": "a white emergency ambulance with large red and blue rooftop warning lights parked outside a clinic, two uniformed paramedics pushing an empty stretcher beside it, viewed clearly from the side, completely blank vehicle with no symbols or writing",
        "bad": "a fresh apple beside a visibly rotten apple with a dark bruise and wilted leaf, clearly showing a good and bad condition without symbols or writing",
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
                                    BUILDING_SCENES.get(
                                        word["id"],
                                        CITY_SCENES.get(
                                            word["id"],
                                            NATURE_SCENES.get(
                                                word["id"],
                                                WORK_SCENES.get(
                                                    word["id"],
                                                    CLOTHING_SCENES.get(
                                                        word["id"],
                                                        HOUSE_SCENES.get(
                                                            word["id"],
                                                            SPORT_SCENES.get(
                                                                word["id"],
                                                                ACTION_SCENES.get(
                                                                    word["id"],
                                                                    ADJECTIVE_SCENES.get(
                                                                        word["id"],
                                                                        FEELING_SCENES.get(
                                                                            word["id"],
                                                                            BODY_SCENES.get(
                                                                                word["id"],
                                                                                SCHOOL_SCENES.get(
                                                                                    word["id"],
                                                                                    ENTERTAINMENT_SCENES.get(
                                                                                        word["id"],
                                                                                        TRANSPORT_SCENES.get(
                                                                                            word["id"],
                                                                                            DIGITAL_SCENES.get(
                                                                                                word["id"],
                                                                                                SHOPPING_SCENES.get(
                                                                                                    word["id"],
                                                                                                    DOCUMENT_SCENES.get(
                                                                                                        word["id"],
                                                                                                        HOBBY_SCENES.get(
                                                                                                            word["id"],
                                                                                                            MANNER_DEGREE_SCENES.get(
                                                                                                                word["id"],
                                                                                                                PREPOSITION_DIRECTION_SCENES.get(
                                                                                                                    word["id"],
                                                                                                                    scene_hints.get(english, fallback_scene),
                                                                                                                ),
                                                                                                            ),
                                                                                                        ),
                                                                                                    ),
                                                                                                ),
                                                                                            ),
                                                                                        ),
                                                                                    ),
                                                                                ),
                                                                            ),
                                                                        ),
                                                                    ),
                                                                ),
                                                            ),
                                                        ),
                                                    ),
                                                ),
                                            ),
                                        ),
                                    ),
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
        "Scene only, full image illustration. Never display the concept name as a heading, label, or caption. "
        "Use plain blank surfaces. Avoid any object that could contain writing."
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
    parser.add_argument("--category", help="Generate only words in this exact category.")
    parser.add_argument("--word-ids", nargs="*", help="Generate specific word ids instead of offset/limit selection.")
    parser.add_argument("--allow-approved", action="store_true", help="Allow regenerating words already accepted in the Comfy manifest.")
    parser.add_argument("--accepted-manifest", type=Path, default=COMFY_MANIFEST_PATH)
    parser.add_argument("--list-only", action="store_true", help="Print the selected words without queueing ComfyUI.")
    parser.add_argument("--width", type=int, default=512)
    parser.add_argument("--height", type=int, default=512)
    parser.add_argument("--timeout", type=int, default=600)
    parser.add_argument("--comfy-url", default="http://127.0.0.1:8188")
    parser.add_argument("--output-root", type=Path, default=DEFAULT_OUTPUT_ROOT)
    args = parser.parse_args()

    all_words = load_words(include_approved=True)
    accepted_ids = set() if args.allow_approved else load_processed_ids(args.accepted_manifest)
    if args.word_ids:
        by_id = {word["id"]: word for word in all_words}
        selected_words = [
            by_id[word_id]
            for word_id in args.word_ids
            if word_id in by_id and word_id not in accepted_ids
        ]
        missing_ids = [
            word_id
            for word_id in args.word_ids
            if word_id not in by_id or word_id in accepted_ids
        ]
        if missing_ids:
            raise SystemExit(f"Unknown or already-accepted word ids: {', '.join(missing_ids)}")
    else:
        selected_words = select_words(
            all_words,
            accepted_ids=accepted_ids,
            category=args.category,
            offset=args.offset,
            limit=args.limit,
        )
    if args.list_only:
        for word in selected_words:
            print(f"{word['id']}\t{word['english']}\t{word.get('category', '')}")
        return
    if not selected_words:
        raise SystemExit("No words selected for generation")

    template = json.loads(WORKFLOW_TEMPLATE_PATH.read_text(encoding="utf-8"))
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
