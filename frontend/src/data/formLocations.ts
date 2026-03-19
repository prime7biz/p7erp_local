import { COUNTRY_COORDINATES } from "./countryCoordinates";

/** Lowercase key for matching city lists to country names. */
export function normalizeCountryKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function titleCaseCountry(key: string): string {
  return key
    .split(" ")
    .map((w) => (w.length ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}

/**
 * One display label per distinct coordinate group in `COUNTRY_COORDINATES`
 * (aliases like "usa" / "united states" collapse to the longest key).
 */
export const FORM_COUNTRIES: string[] = (() => {
  const groups = new Map<string, string[]>();
  for (const key of Object.keys(COUNTRY_COORDINATES)) {
    if (key === "unknown") continue;
    const c = COUNTRY_COORDINATES[key];
    if (!c) continue;
    const coordKey = `${c[0]},${c[1]}`;
    if (!groups.has(coordKey)) groups.set(coordKey, []);
    groups.get(coordKey)!.push(key);
  }
  return Array.from(groups.values())
    .map((aliases) => aliases.reduce((a, b) => (a.length >= b.length ? a : b)))
    .map(titleCaseCountry)
    .sort((a, b) => a.localeCompare(b));
})();

/**
 * Major business cities for common trading partners (extend as needed).
 * Keys must match `normalizeCountryKey(displayCountryName)`.
 */
const MAJOR_CITIES_BY_COUNTRY: Record<string, string[]> = {
  australia: ["Sydney", "Melbourne", "Brisbane", "Perth", "Adelaide"],
  austria: ["Vienna", "Graz", "Linz", "Salzburg"],
  bangladesh: ["Dhaka", "Chattogram", "Gazipur", "Narayanganj", "Savar", "Ashulia"],
  belgium: ["Brussels", "Antwerp", "Ghent", "Charleroi", "Liège"],
  brazil: ["São Paulo", "Rio de Janeiro", "Brasília", "Salvador", "Fortaleza"],
  canada: ["Toronto", "Vancouver", "Montreal", "Calgary", "Ottawa", "Edmonton"],
  china: ["Shanghai", "Beijing", "Guangzhou", "Shenzhen", "Ningbo", "Qingdao", "Hangzhou"],
  "czech republic": ["Prague", "Brno", "Ostrava"],
  denmark: ["Copenhagen", "Aarhus", "Odense"],
  egypt: ["Cairo", "Alexandria", "Giza"],
  finland: ["Helsinki", "Espoo", "Tampere"],
  france: ["Paris", "Lyon", "Marseille", "Toulouse", "Nice", "Bordeaux"],
  germany: ["Berlin", "Hamburg", "Munich", "Frankfurt", "Cologne", "Stuttgart", "Düsseldorf"],
  greece: ["Athens", "Thessaloniki", "Patras"],
  "hong kong": ["Hong Kong"],
  hungary: ["Budapest", "Debrecen", "Szeged"],
  india: ["Mumbai", "Delhi", "Bangalore", "Chennai", "Hyderabad", "Kolkata", "Ahmedabad", "Pune"],
  indonesia: ["Jakarta", "Surabaya", "Bandung", "Medan", "Semarang"],
  ireland: ["Dublin", "Cork", "Galway"],
  israel: ["Tel Aviv", "Jerusalem", "Haifa"],
  italy: ["Milan", "Rome", "Naples", "Turin", "Florence", "Venice"],
  japan: ["Tokyo", "Osaka", "Yokohama", "Nagoya", "Fukuoka", "Kobe"],
  jordan: ["Amman", "Zarqa", "Irbid"],
  kenya: ["Nairobi", "Mombasa", "Kisumu"],
  "south korea": ["Seoul", "Busan", "Incheon", "Daegu", "Daejeon"],
  korea: ["Seoul", "Busan", "Incheon", "Daegu", "Daejeon"],
  malaysia: ["Kuala Lumpur", "George Town", "Johor Bahru", "Shah Alam"],
  mexico: ["Mexico City", "Guadalajara", "Monterrey", "Puebla", "Tijuana"],
  morocco: ["Casablanca", "Rabat", "Fes", "Marrakesh", "Tangier"],
  netherlands: ["Amsterdam", "Rotterdam", "The Hague", "Utrecht", "Eindhoven"],
  "the netherlands": ["Amsterdam", "Rotterdam", "The Hague", "Utrecht", "Eindhoven"],
  "new zealand": ["Auckland", "Wellington", "Christchurch", "Hamilton"],
  nigeria: ["Lagos", "Abuja", "Kano", "Ibadan", "Port Harcourt"],
  norway: ["Oslo", "Bergen", "Trondheim", "Stavanger"],
  pakistan: ["Karachi", "Lahore", "Islamabad", "Faisalabad", "Rawalpindi"],
  philippines: ["Manila", "Quezon City", "Davao", "Cebu", "Caloocan"],
  poland: ["Warsaw", "Kraków", "Łódź", "Wrocław", "Poznań"],
  portugal: ["Lisbon", "Porto", "Braga", "Coimbra"],
  romania: ["Bucharest", "Cluj-Napoca", "Timișoara", "Iași"],
  "saudi arabia": ["Riyadh", "Jeddah", "Mecca", "Medina", "Dammam"],
  singapore: ["Singapore"],
  "south africa": ["Johannesburg", "Cape Town", "Durban", "Pretoria", "Port Elizabeth"],
  spain: ["Madrid", "Barcelona", "Valencia", "Seville", "Bilbao", "Zaragoza"],
  "sri lanka": ["Colombo", "Kandy", "Galle", "Jaffna"],
  sweden: ["Stockholm", "Gothenburg", "Malmö", "Uppsala"],
  switzerland: ["Zurich", "Geneva", "Basel", "Bern", "Lausanne"],
  taiwan: ["Taipei", "Kaohsiung", "Taichung", "Tainan"],
  thailand: ["Bangkok", "Chiang Mai", "Pattaya", "Hat Yai"],
  turkey: ["Istanbul", "Ankara", "İzmir", "Bursa", "Antalya"],
  turkiye: ["Istanbul", "Ankara", "İzmir", "Bursa", "Antalya"],
  "united arab emirates": ["Dubai", "Abu Dhabi", "Sharjah", "Ajman"],
  uae: ["Dubai", "Abu Dhabi", "Sharjah", "Ajman"],
  "united kingdom": ["London", "Manchester", "Birmingham", "Leeds", "Glasgow", "Liverpool", "Bristol"],
  uk: ["London", "Manchester", "Birmingham", "Leeds", "Glasgow", "Liverpool", "Bristol"],
  "united states": [
    "New York",
    "Los Angeles",
    "Chicago",
    "Houston",
    "Phoenix",
    "San Antonio",
    "San Diego",
    "Dallas",
    "San Jose",
    "Miami",
    "Seattle",
    "Boston",
    "Atlanta",
    "Denver",
    "Washington",
  ],
  "united states of america": [
    "New York",
    "Los Angeles",
    "Chicago",
    "Houston",
    "Phoenix",
    "San Antonio",
    "San Diego",
    "Dallas",
    "San Jose",
    "Miami",
    "Seattle",
    "Boston",
    "Atlanta",
    "Denver",
    "Washington",
  ],
  usa: [
    "New York",
    "Los Angeles",
    "Chicago",
    "Houston",
    "Phoenix",
    "San Antonio",
    "San Diego",
    "Dallas",
    "San Jose",
    "Miami",
    "Seattle",
    "Boston",
    "Atlanta",
    "Denver",
    "Washington",
  ],
  us: [
    "New York",
    "Los Angeles",
    "Chicago",
    "Houston",
    "Phoenix",
    "San Antonio",
    "San Diego",
    "Dallas",
    "San Jose",
    "Miami",
    "Seattle",
    "Boston",
    "Atlanta",
    "Denver",
    "Washington",
  ],
  vietnam: ["Ho Chi Minh City", "Hanoi", "Da Nang", "Hai Phong", "Can Tho"],
  "viet nam": ["Ho Chi Minh City", "Hanoi", "Da Nang", "Hai Phong", "Can Tho"],
};

export function citiesForCountry(countryDisplayName: string): string[] {
  const key = normalizeCountryKey(countryDisplayName);
  const raw = MAJOR_CITIES_BY_COUNTRY[key];
  if (!raw) return [];
  return [...raw].sort((a, b) => a.localeCompare(b));
}
