// Info cards: ~425 event topics × 60 card layouts (≈ 25,500 ready-made cards before colour themes). Each topic carries a
// Lucide icon (bundled — no download), a title and starter wording; layouts vary icon placement, frame and emphasis.
const TOPIC_SRC = `Arrival|DoorOpen|Doors open|Doors open at 19:00 — please arrive on time.
Arrival|DoorClosed|Last entry|Last entry is at 22:00.
Arrival|IdCard|Bring ID|Photo ID is required for entry.
Arrival|Ticket|Have your ticket ready|Show the QR code on your phone at the door.
Arrival|QrCode|Scan to check in|Scan your ticket at the entrance.
Arrival|ShieldCheck|Bag search|Bags may be searched on entry.
Arrival|Clock|Running order|See the schedule for set times.
Arrival|LogIn|Guest list|Names on the door — bring ID.
Arrival|Users|Group bookings|Groups of 10+ please check in together.
Arrival|BadgeCheck|VIP entrance|VIP guests use the priority lane.
Dress & style|Shirt|Dress code|Smart casual.
Dress & style|Crown|Black tie|Black tie, please.
Dress & style|Sparkles|Dress to impress|Bring your best look.
Dress & style|Palette|Theme|Colour theme: all white.
Dress & style|Glasses|Fancy dress|Come as your favourite icon.
Dress & style|Footprints|Comfortable shoes|There’s dancing — wear comfortable shoes.
Dress & style|Umbrella|Weather|Outdoor event — bring a jacket.
Food & drink|Utensils|Dinner|Dinner is served at 19:30.
Food & drink|UtensilsCrossed|Menu|Three courses with seasonal produce.
Food & drink|Salad|Vegetarian|Vegetarian options available.
Food & drink|Leaf|Vegan|Vegan options available — ask our team.
Food & drink|Wheat|Gluten free|Gluten-free dishes are marked GF.
Food & drink|Nut|Allergens|Tell us about allergies before you order.
Food & drink|Fish|Seafood|Contains fish and shellfish.
Food & drink|Milk|Dairy|Contains milk.
Food & drink|Egg|Eggs|Contains egg.
Food & drink|Wine|Wine list|Ask for our sommelier’s picks.
Food & drink|Beer|Craft beer|Local beers on tap.
Food & drink|Martini|Cocktails|Signature cocktails from £9.
Food & drink|GlassWater|Free water|Free tap water at every bar.
Food & drink|Coffee|Coffee|Barista coffee all day.
Food & drink|CupSoda|Soft drinks|Soft drinks and mocktails available.
Food & drink|Cake|Cake cutting|Cake cutting at 21:00.
Food & drink|Pizza|Late-night food|Pizza from 23:00.
Food & drink|Popcorn|Snacks|Snacks at the kiosk.
Food & drink|IceCreamCone|Dessert bar|Help yourself at the dessert bar.
Food & drink|ChefHat|Chef’s table|Meet the chef at 20:00.
Food & drink|Beef|Carvery|Carvery served from 18:30.
Food & drink|Sandwich|Buffet|Buffet opens at 13:00.
Food & drink|Citrus|Happy hour|Happy hour 17:00–19:00.
Food & drink|Ban|Over 18s only|We operate Challenge 25.
Venue|MapPin|Location|1 River Way, London SE1.
Venue|Map|Venue map|Find the floor plan at reception.
Venue|Navigation|Directions|Follow the signs to Hall B.
Venue|Building|Venue|Welcome to the Grand Hall.
Venue|Armchair|Seating|Unreserved seating — first come, first served.
Venue|Table|Your table|Find your table on the seating plan.
Venue|LayoutGrid|Seating plan|Check the plan to find your seat.
Venue|Toilet|Toilets|Toilets are on the ground floor.
Venue|Accessibility|Accessibility|Step-free access via the side entrance.
Venue|Baby|Baby change|Baby changing on the first floor.
Venue|Bed|Accommodation|Rooms available at the partner hotel.
Venue|Lock|Cloakroom|Cloakroom £2 per item.
Venue|Package|Lost property|Lost something? Ask at the info desk.
Venue|Info|Information desk|Questions? Visit the info desk.
Venue|CigaretteOff|No smoking|Smoking area outside only.
Venue|Cigarette|Smoking area|Smoking area by the garden gate.
Venue|Dog|Dog friendly|Well-behaved dogs welcome.
Venue|Recycle|Recycling|Please use the recycling points.
Venue|Lamp|Quiet room|Quiet space available upstairs.
Travel|CircleParking|Parking|Free parking on site.
Travel|Car|Drop-off|Drop-off zone at the front entrance.
Travel|Bus|Shuttle bus|Shuttle from the station every 20 minutes.
Travel|TramFront|Public transport|Nearest station: London Bridge.
Travel|Bike|Bike racks|Secure bike parking by the entrance.
Travel|Plane|Travelling far?|Airport transfers available.
Travel|Fuel|EV charging|EV chargers in the car park.
Travel|Navigation|Taxis|Taxi rank outside the main doors.
Connect|Wifi|Wi-Fi|Network: Gala-Guests.
Connect|Smartphone|Phones on silent|Please silence your phone.
Connect|Camera|Photos|Share your photos with our hashtag.
Connect|Video|Filming|This event is being filmed.
Connect|Hash|Hashtag|#SummerGala26
Connect|AtSign|Follow us|@yourevent
Connect|Globe|Website|yourevent.com
Connect|Mail|Contact|hello@yourevent.com
Connect|Phone|Call us|020 7946 0000
Connect|Megaphone|Announcements|Listen for announcements.
Connect|Vote|Live poll|Vote now on your phone.
Programme|Music|Live music|Live band from 20:00.
Programme|Music2|DJ set|DJ till late.
Programme|MicVocal|Speeches|Speeches at 21:00.
Programme|Mic|Host|Your host for tonight.
Programme|Headphones|Silent disco|Grab headphones at the bar.
Programme|Guitar|Acoustic set|Acoustic session in the garden.
Programme|Drum|Drum show|Drum performance at 22:00.
Programme|Piano|Piano bar|Piano bar open all night.
Programme|PartyPopper|First dance|First dance at 21:30.
Programme|Gift|Gifts|Gift table by the entrance.
Programme|Trophy|Awards|Awards ceremony at 21:00.
Programme|Medal|Winners|Congratulations to our winners.
Programme|Award|Prize draw|Prize draw at 22:30.
Programme|Dice5|Raffle|Raffle tickets £5 — all proceeds to charity.
Programme|Gamepad2|Games|Games room open all day.
Programme|Presentation|Keynote|Keynote in the main hall at 10:00.
Programme|BookOpen|Workshops|Workshops in rooms 1–4.
Programme|GraduationCap|Masterclass|Masterclass at 14:00.
Programme|Briefcase|Networking|Networking drinks at 17:30.
Programme|Handshake|Meet & greet|Meet & greet after the show.
Programme|Clapperboard|Screening|Screening starts at 19:30.
Programme|Theater|Performance|Curtain up at 19:30.
Programme|Drama|Comedy|Comedy from 21:00.
Programme|Tv|Live on screen|Watch live on the big screen.
Programme|Disc3|Vinyl night|Bring your favourite record.
Programme|Rocket|Launch|Product launch at 18:00.
Programme|Sparkles|Fireworks|Fireworks at 22:00.
Programme|Flame|Bonfire|Bonfire lights at 19:00.
Programme|Star|Headliner|Headliner on at 21:30.
Programme|Heart|Charity|Supporting our chosen charity.
Programme|Smartphone|App|Download the event app.
Safety|Cross|First aid|First aid by the main stage.
Safety|Stethoscope|Medical|Medical team on site.
Safety|Siren|Emergency exits|Know your nearest exit.
Safety|TriangleAlert|Caution|Wet floor — take care.
Safety|ShieldAlert|Security|Security staff are here to help.
Safety|Droplets|Stay hydrated|Free water at every bar.
Safety|Sun|Sun safety|Wear sun cream and a hat.
Safety|Volume2|Loud music|Ear plugs available at the bar.
Safety|Pill|Look after each other|Ask any staff member for help.
Safety|UserCheck|Welfare|Welfare tent by the entrance.
Shop|ShoppingBag|Merch|Merch stand near the exit.
Shop|CreditCard|Cashless|This is a cashless event.
Shop|Banknote|Cash bar|Cash and card accepted.
Shop|Wallet|Top up|Top up your wristband at the kiosk.
Shop|Gem|Raffle prizes|See the prize table.
Shop|Truck|Delivery|We deliver across London.
Wedding|Heart|Welcome|Welcome to our wedding.
Wedding|Flower|Ceremony|Ceremony at 14:00 in the garden.
Wedding|Flower2|Reception|Reception from 16:00.
Wedding|Camera|Unplugged ceremony|Please keep phones away during the ceremony.
Wedding|Gift|Wedding gifts|Your presence is our present.
Wedding|Users|Order of the day|See the order of the day.
Wedding|Wine|Toasts|Raise a glass at 18:00.
Wedding|Cake|Cutting the cake|Cake cutting at 20:00.
Party|PartyPopper|Let’s party|The party starts now.
Party|Cake|Happy birthday|Celebrating in style.
Party|Gift|Party bags|Party bags at the door.
Party|Music|Requests|Song requests at the DJ booth.
Party|Ghost|Halloween|Best costume wins a prize.
Party|TreePine|Christmas party|Festive cheer all night.
Party|Snowflake|Winter party|Hot drinks at the bar.
Party|TreePalm|Summer party|Garden open till late.
Party|Anchor|Boat party|Boarding from 18:30.
Party|Tent|Festival|Camping opens Friday 12:00.
Business|Laptop|Agenda online|Full agenda in the event app.
Business|Lightbulb|Breakout|Breakout sessions at 11:30.
Business|Briefcase|Exhibitors|Visit the exhibition hall.
Business|Handshake|Sponsors|Thank you to our sponsors.
Business|Speaker|Q&A|Submit questions in the app.
Business|Key|Badge collection|Collect your badge at registration.
Business|Plug|Charging|Charging points in the lounge.
Business|Battery|Low battery?|Power banks at the info desk.
Business|Trash|Keep it clean|Please take litter home.`;
import { MORE_TOPICS } from "./info-topics";
export type CardTopic = { group: string; icon: string; title: string; text: string };
export const CARD_TOPICS: CardTopic[] = `${TOPIC_SRC}\n${MORE_TOPICS}`.split("\n").filter(Boolean).map(r => { const [group, icon, title, text] = r.split("|"); return { group: group!, icon: icon!, title: title!, text: text! }; });
const ICON_POS = ["left", "top", "right", "badge", "none"] as const;
const FRAMES = ["card", "rounded", "pill", "outline", "banner", "ticket", "sticker", "split", "tile", "accent", "elevated", "minimal"] as const;
export type CardLayout = { id: number; icon: (typeof ICON_POS)[number]; frame: (typeof FRAMES)[number]; name: string };
export const CARD_LAYOUTS: CardLayout[] = ICON_POS.flatMap(icon => FRAMES.map(frame => ({ icon, frame }))).map((x, id) => ({ id, ...x, name: `${x.frame[0]!.toUpperCase()}${x.frame.slice(1)} · icon ${x.icon}` }));
export const cardSize = (lay: CardLayout) => lay.frame === "pill" || lay.frame === "banner" ? { w: 760, h: 160 } : lay.icon === "top" || lay.icon === "badge" ? { w: 520, h: 420 } : { w: 760, h: 240 };
export const infoCardCount = () => CARD_TOPICS.length * CARD_LAYOUTS.length;
