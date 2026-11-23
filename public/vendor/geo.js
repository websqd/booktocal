// bookingtocal — places, airports, airlines. Classic script exposing BTCGeo.
// Depends on airports.js (generated table: BTC_AIRPORTS / BTC_AIRPORT_ZONES).
// Everything here is lookup data plus small pure helpers; the parser asks it
// "which airport is this text?", "which timezone is this place in?" and "how
// long does this flight take?". Extend the tables here when a place resolves
// wrong — never special-case places in the parser or the exporters.
var BTCGeo = (function () {
  'use strict';

  // --- text normalisation ----------------------------------------------------

  // Lowercase ASCII without accents: "București Nord" -> "bucuresti nord".
  function norm(s) {
    return String(s == null ? '' : s)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[łŁ]/g, 'l').replace(/[øØ]/g, 'o').replace(/[đĐ]/g, 'd').replace(/ı/g, 'i').replace(/ß/g, 'ss')
      .toLowerCase();
  }

  // Words that never distinguish one airport or city from another.
  const NOISE = /\b(?:international|intl|airport|aeroporto|aeropuerto|aeroport|flughafen|terminal|city|apt|arpt|t\d|\d+)\b/g;

  function placeTokens(s) {
    return norm(s).replace(/[^a-z0-9' ]+/g, ' ').replace(NOISE, ' ').replace(/'/g, '').split(/\s+/).filter(Boolean);
  }

  // --- airports ----------------------------------------------------------------

  let airportIndex = null; // lazily parsed: the table is ~3,200 rows
  let airportByCode = null;
  const tokenFrequency = Object.create(null); // word -> number of airports using it

  function loadAirports() {
    if (airportIndex) return;
    airportIndex = [];
    airportByCode = Object.create(null);
    const zones = typeof BTC_AIRPORT_ZONES !== 'undefined' ? BTC_AIRPORT_ZONES : [];
    const rows = typeof BTC_AIRPORTS !== 'undefined' && BTC_AIRPORTS ? BTC_AIRPORTS.split(';') : [];
    for (const row of rows) {
      const f = row.split('|');
      const cityTokens = placeTokens(f[1]);
      const a = {
        code: f[0], city: f[1], name: f[2], tz: zones[parseInt(f[3], 36)] || null,
        lat: Number(f[4]), lon: Number(f[5]),
        cityKey: cityTokens.join(''),
        tokens: new Set(cityTokens.concat(placeTokens(f[2]), [f[0].toLowerCase()])),
      };
      airportIndex.push(a);
      airportByCode[a.code] = a;
      for (const tok of a.tokens) tokenFrequency[tok] = (tokenFrequency[tok] || 0) + 1;
    }
  }

  function airport(code) {
    loadAirports();
    return airportByCode[String(code || '').toUpperCase()] || null;
  }

  // Names people and airlines use that are in neither the city nor the airport
  // name ("Otopeni" for Henri Coandă, "Saigon" for Ho Chi Minh City).
  const AIRPORT_ALIAS = {
    'otopeni': 'OTP', 'bucharest otopeni': 'OTP', 'bucuresti': 'OTP', 'saigon': 'SGN', 'hcmc': 'SGN', 'hochiminh': 'SGN',
    'bali': 'DPS', 'klia': 'KUL', 'klia2': 'KUL', 'don muang': 'DMK', 'bangkok don muang': 'DMK', 'donmueang': 'DMK',
    'cam ranh': 'CXR', 'nha trang': 'CXR', 'danang': 'DAD', 'ha noi': 'HAN', 'phu quoc island': 'PQC',
    'gatwick': 'LGW', 'stansted': 'STN', 'luton': 'LTN', 'narita': 'NRT', 'haneda': 'HND', 'kansai': 'KIX',
    'schiphol': 'AMS', 'charles de gaulle': 'CDG', 'roissy': 'CDG', 'orly': 'ORY', 'fiumicino': 'FCO',
    'malpensa': 'MXP', 'linate': 'LIN', 'bergamo': 'BGY', 'jfk': 'JFK', 'newark': 'EWR', 'ohare': 'ORD',
    'incheon': 'ICN', 'gimpo': 'GMP', 'taoyuan': 'TPE', 'sabiha gokcen': 'SAW', 'changi': 'SIN',
    'heathrow': 'LHR', 'suvarnabhumi': 'BKK', 'tan son nhat': 'SGN', 'noi bai': 'HAN', 'new york': 'JFK',
    'kuala lumpur': 'KUL', 'koh samui': 'USM', 'samui': 'USM', 'mallorca': 'PMI', 'majorca': 'PMI', 'crete': 'HER',
    'munchen': 'MUC', 'wien': 'VIE', 'roma': 'FCO', 'milano': 'MXP', 'venezia': 'VCE', 'firenze': 'FLR',
    'napoli': 'NAP', 'lisboa': 'LIS', 'praha': 'PRG', 'warszawa': 'WAW', 'koln': 'CGN', 'geneve': 'GVA',
    'kobenhavn': 'CPH', 'athina': 'ATH', 'moskva': 'SVO', 'bruxelles': 'BRU', 'cluj': 'CLJ',
  };

  // Free text -> airport, or null. Tries, in order: an explicit known IATA code
  // in the text, an alias, an exact city, then "every word of the query appears
  // in the airport's city + name" ("bangkok don mueang" -> DMK, not BKK).
  function findAirport(text) {
    loadAirports();
    const raw = String(text || '');
    const codeM = raw.match(/\(([A-Z]{3})\)/) || raw.match(/^\s*([A-Z]{3})\s*$/);
    if (codeM && airportByCode[codeM[1]]) return airportByCode[codeM[1]];
    const tries = [raw];
    if (raw.includes(',')) tries.push(raw.split(',')[0]);
    for (const t of tries) {
      const tokens = placeTokens(t);
      if (!tokens.length || tokens.length > 6) continue;
      const spaced = tokens.join(' ');
      const key = tokens.join('');
      if (key.length < 3) continue;
      if (AIRPORT_ALIAS[spaced]) return airportByCode[AIRPORT_ALIAS[spaced]] || null;
      if (AIRPORT_ALIAS[key]) return airportByCode[AIRPORT_ALIAS[key]] || null;
      for (const a of airportIndex) if (a.cityKey === key) return a;
      // A single word must be distinctive ("heathrow", "changi"): common name
      // words such as "don", "central" or "north" occur in many airports.
      if (tokens.length === 1 && (tokens[0].length < 5 || (tokenFrequency[tokens[0]] || 0) > 2)) continue;
      for (const a of airportIndex) {
        let all = true;
        for (const tok of tokens) if (!a.tokens.has(tok)) { all = false; break; }
        if (all) return a;
      }
    }
    return null;
  }

  // "HEATHROW CHANGI" / "Phu Quoc Ho Chi Minh" -> [from, to] when the line is
  // exactly two known places with no separator between them.
  function splitTwoAirports(text) {
    const words = String(text || '').replace(/[()\-–—→>|,]+/g, ' ').trim().split(/\s+/).filter(Boolean);
    if (words.length < 2 || words.length > 9) return null;
    for (let i = 1; i < words.length; i++) {
      const a = findAirport(words.slice(0, i).join(' '));
      if (!a) continue;
      const b = findAirport(words.slice(i).join(' '));
      if (b && b.code !== a.code) return [a, b];
    }
    return null;
  }

  // Scheduled block time estimate from great-circle distance: taxi/climb/descent
  // overhead plus cruise. Good to roughly +-15% — callers flag it as estimated.
  function flightMinutes(a, b) {
    if (!a || !b || !isFinite(a.lat) || !isFinite(b.lat)) return null;
    const rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
    const km = 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
    return Math.max(30, Math.round((40 + (km / 830) * 60) / 5) * 5);
  }

  // --- airlines ------------------------------------------------------------------
  // IATA designator -> name. Curated to carriers a traveller actually books: an
  // unlabelled "XX 123" only counts as a flight number when XX is in here, so
  // adding obscure designators raises false positives ("TAX: C4", "YR02").
  const AIRLINES = {
    // Europe
    BA: 'British Airways', LH: 'Lufthansa', AF: 'Air France', KL: 'KLM', IB: 'Iberia', AZ: 'ITA Airways',
    LX: 'SWISS', OS: 'Austrian Airlines', SN: 'Brussels Airlines', SK: 'SAS', AY: 'Finnair', EI: 'Aer Lingus',
    TP: 'TAP Air Portugal', LO: 'LOT Polish Airlines', OK: 'Czech Airlines', RO: 'TAROM', FB: 'Bulgaria Air',
    JU: 'Air Serbia', OU: 'Croatia Airlines', A3: 'Aegean Airlines', OA: 'Olympic Air', TK: 'Turkish Airlines',
    PC: 'Pegasus Airlines', XQ: 'SunExpress', FR: 'Ryanair', RK: 'Ryanair UK', U2: 'easyJet', EC: 'easyJet Europe',
    DS: 'easyJet Switzerland', W6: 'Wizz Air', W4: 'Wizz Air Malta', W9: 'Wizz Air UK', VY: 'Vueling',
    UX: 'Air Europa', I2: 'Iberia Express', V7: 'Volotea', HV: 'Transavia', TO: 'Transavia France',
    EW: 'Eurowings', DE: 'Condor', X3: 'TUI fly', BY: 'TUI Airways', LS: 'Jet2', VS: 'Virgin Atlantic',
    DY: 'Norwegian', D8: 'Norwegian Air Sweden', BT: 'airBaltic', FI: 'Icelandair', LG: 'Luxair', KM: 'KM Malta Airlines',
    CY: 'Cyprus Airways', WK: 'Edelweiss Air', EN: 'Air Dolomiti', H4: 'HiSky', A2: 'Animawings', '0B': 'Blue Air',
    PS: 'Ukraine International', SU: 'Aeroflot', S7: 'S7 Airlines', LY: 'El Al', '5F': 'Fly One', QS: 'Smartwings',
    // Middle East & Africa
    EK: 'Emirates', EY: 'Etihad Airways', QR: 'Qatar Airways', FZ: 'flydubai', G9: 'Air Arabia', '5W': 'Wizz Air Abu Dhabi',
    GF: 'Gulf Air', WY: 'Oman Air', SV: 'Saudia', XY: 'flynas', KU: 'Kuwait Airways', J9: 'Jazeera Airways',
    RJ: 'Royal Jordanian', ME: 'Middle East Airlines', MS: 'EgyptAir', AT: 'Royal Air Maroc', TU: 'Tunisair',
    AH: 'Air Algerie', ET: 'Ethiopian Airlines', KQ: 'Kenya Airways', SA: 'South African Airways', FA: 'FlySafair',
    WB: 'RwandAir', MK: 'Air Mauritius', W3: 'Arik Air',
    // South & Central Asia
    AI: 'Air India', '6E': 'IndiGo', SG: 'SpiceJet', IX: 'Air India Express', QP: 'Akasa Air', UL: 'SriLankan Airlines',
    PK: 'Pakistan International Airlines', BG: 'Biman Bangladesh', RA: 'Nepal Airlines', Q2: 'Maldivian',
    KC: 'Air Astana', HY: 'Uzbekistan Airways', J2: 'Azerbaijan Airlines', A9: 'Georgian Airways',
    // South-East Asia
    SQ: 'Singapore Airlines', TR: 'Scoot', MH: 'Malaysia Airlines', OD: 'Batik Air Malaysia', FY: 'Firefly',
    AK: 'AirAsia', D7: 'AirAsia X', FD: 'Thai AirAsia', XJ: 'Thai AirAsia X', QZ: 'Indonesia AirAsia',
    Z2: 'Philippines AirAsia', KT: 'AirAsia Cambodia', TG: 'Thai Airways', PG: 'Bangkok Airways', DD: 'Nok Air',
    SL: 'Thai Lion Air', VZ: 'Thai Vietjet Air', VJ: 'Vietjet Air', VN: 'Vietnam Airlines', VU: 'Vietravel Airlines',
    QH: 'Bamboo Airways', BL: 'Pacific Airlines', '0V': 'VASCO', K6: 'Air Cambodia', KR: 'Cambodia Airways',
    QV: 'Lao Airlines', '8M': 'Myanmar Airways International', GA: 'Garuda Indonesia', JT: 'Lion Air',
    ID: 'Batik Air', QG: 'Citilink', IU: 'Super Air Jet', IW: 'Wings Air', PR: 'Philippine Airlines',
    '5J': 'Cebu Pacific', BI: 'Royal Brunei Airlines', '3K': 'Jetstar Asia',
    // East Asia
    CX: 'Cathay Pacific', UO: 'HK Express', HX: 'Hong Kong Airlines', NX: 'Air Macau', BR: 'EVA Air',
    CI: 'China Airlines', JX: 'Starlux Airlines', IT: 'Tigerair Taiwan', JL: 'Japan Airlines', NH: 'ANA',
    MM: 'Peach Aviation', GK: 'Jetstar Japan', BC: 'Skymark Airlines', ZG: 'ZIPAIR', '7G': 'StarFlyer',
    KE: 'Korean Air', OZ: 'Asiana Airlines', '7C': 'Jeju Air', LJ: 'Jin Air', TW: "T'way Air", BX: 'Air Busan',
    CA: 'Air China', MU: 'China Eastern', CZ: 'China Southern', HU: 'Hainan Airlines', '3U': 'Sichuan Airlines',
    ZH: 'Shenzhen Airlines', MF: 'XiamenAir', '9C': 'Spring Airlines', HO: 'Juneyao Air', OM: 'MIAT Mongolian',
    // Oceania
    QF: 'Qantas', JQ: 'Jetstar', VA: 'Virgin Australia', NZ: 'Air New Zealand', FJ: 'Fiji Airways', PX: 'Air Niugini',
    // Americas
    AA: 'American Airlines', DL: 'Delta Air Lines', UA: 'United Airlines', WN: 'Southwest Airlines', B6: 'JetBlue',
    AS: 'Alaska Airlines', NK: 'Spirit Airlines', F9: 'Frontier Airlines', HA: 'Hawaiian Airlines', G4: 'Allegiant Air',
    AC: 'Air Canada', WS: 'WestJet', PD: 'Porter Airlines', TS: 'Air Transat', AM: 'Aeromexico', Y4: 'Volaris',
    VB: 'Viva Aerobus', CM: 'Copa Airlines', AV: 'Avianca', LA: 'LATAM Airlines', JJ: 'LATAM Brasil',
    G3: 'GOL', AD: 'Azul', AR: 'Aerolineas Argentinas', H2: 'Sky Airline', JA: 'JetSMART',
  };

  // Brand names as they appear in documents -> designator, where the table
  // name alone would not match ("VietJet Aviation", "Thai Airasia").
  const AIRLINE_ALIAS = {
    'vietjet aviation': 'VJ', 'vietjet': 'VJ', 'vietjetair': 'VJ', 'vietjet air': 'VJ', 'thai vietjet': 'VZ',
    'airasia': 'AK', 'air asia': 'AK', 'thai airasia': 'FD', 'thai air asia': 'FD', 'indonesia airasia': 'QZ',
    'wizz air': 'W6', 'wizz': 'W6', 'wizzair': 'W6', 'easyjet': 'U2', 'ryanair': 'FR', 'klm royal dutch airlines': 'KL',
    'ana all nippon airways': 'NH', 'all nippon airways': 'NH', 'swiss international air lines': 'LX',
    'scandinavian airlines': 'SK', 'tap portugal': 'TP', 'latam': 'LA',
    'jetblue airways': 'B6', 'singapore air': 'SQ', 'cathay': 'CX', 'eva airways': 'BR',
    'bangkok air': 'PG', 'vietnam air': 'VN', 'cebu pacific air': '5J',
    'air china limited': 'CA', 'norwegian air shuttle': 'DY', 'air baltic': 'BT', 'aegean': 'A3',
  };

  let airlineNames = null; // [{ re, code }] longest name first

  function loadAirlineNames() {
    if (airlineNames) return;
    const entries = [];
    // Very short brand names ("ANA", "GOL", "Azul") are everyday words elsewhere.
    for (const code in AIRLINES) { const n = norm(AIRLINES[code]); if (n.length >= 5 || n === 'klm' || n === 'jet2') entries.push([n, code]); }
    for (const name in AIRLINE_ALIAS) entries.push([name, AIRLINE_ALIAS[name]]);
    entries.sort((a, b) => b[0].length - a[0].length);
    airlineNames = entries.map(([name, code]) => ({
      re: new RegExp('(?:^|[^a-z])' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s*') + '(?![a-z])'),
      code,
    }));
  }

  function airlineName(code) {
    return AIRLINES[String(code || '').toUpperCase()] || null;
  }

  // Airline mentioned by name in `text` -> designator ("Nok Air ... 525" lets
  // the parser rebuild DD525 when a boarding pass prints only the digits).
  function airlineCodeIn(text) {
    loadAirlineNames();
    const t = norm(text);
    for (const e of airlineNames) if (e.re.test(t)) return e.code;
    return null;
  }

  // --- place words -> timezone ----------------------------------------------------
  // Countries, regions and the cities bookings name most. Hotels and stations
  // rarely carry an IATA code, so this is what gives them a zone.
  const TZ_BY_PLACE = {
    'singapore': 'Asia/Singapore', 'hong kong': 'Asia/Hong_Kong', 'macau': 'Asia/Macau', 'taiwan': 'Asia/Taipei', 'taipei': 'Asia/Taipei',
    'china': 'Asia/Shanghai', 'beijing': 'Asia/Shanghai', 'shanghai': 'Asia/Shanghai',
    'japan': 'Asia/Tokyo', 'tokyo': 'Asia/Tokyo', 'osaka': 'Asia/Tokyo', 'kyoto': 'Asia/Tokyo', 'hiroshima': 'Asia/Tokyo',
    'nagoya': 'Asia/Tokyo', 'fukuoka': 'Asia/Tokyo', 'sapporo': 'Asia/Tokyo', 'nara': 'Asia/Tokyo', 'okinawa': 'Asia/Tokyo',
    'yokohama': 'Asia/Tokyo', 'kobe': 'Asia/Tokyo', 'sendai': 'Asia/Tokyo', 'kanazawa': 'Asia/Tokyo', 'hakata': 'Asia/Tokyo',
    'shin-osaka': 'Asia/Tokyo', 'shinagawa': 'Asia/Tokyo', 'shinkansen': 'Asia/Tokyo', 'jr east': 'Asia/Tokyo', 'jr west': 'Asia/Tokyo',
    'jr central': 'Asia/Tokyo', 'japan rail': 'Asia/Tokyo',
    'south korea': 'Asia/Seoul', 'korea': 'Asia/Seoul', 'seoul': 'Asia/Seoul', 'busan': 'Asia/Seoul',
    'thailand': 'Asia/Bangkok', 'bangkok': 'Asia/Bangkok', 'phuket': 'Asia/Bangkok', 'chiang mai': 'Asia/Bangkok', 'chiangmai': 'Asia/Bangkok',
    'krabi': 'Asia/Bangkok', 'samui': 'Asia/Bangkok', 'pattaya': 'Asia/Bangkok',
    'vietnam': 'Asia/Ho_Chi_Minh', 'viet nam': 'Asia/Ho_Chi_Minh', 'ho chi minh': 'Asia/Ho_Chi_Minh', 'saigon': 'Asia/Ho_Chi_Minh',
    'hanoi': 'Asia/Ho_Chi_Minh', 'ha noi': 'Asia/Ho_Chi_Minh', 'da nang': 'Asia/Ho_Chi_Minh', 'danang': 'Asia/Ho_Chi_Minh',
    'nha trang': 'Asia/Ho_Chi_Minh', 'hue': 'Asia/Ho_Chi_Minh', 'phu quoc': 'Asia/Ho_Chi_Minh', 'hoi an': 'Asia/Ho_Chi_Minh',
    'malaysia': 'Asia/Kuala_Lumpur', 'kuala lumpur': 'Asia/Kuala_Lumpur', 'penang': 'Asia/Kuala_Lumpur', 'langkawi': 'Asia/Kuala_Lumpur',
    'indonesia': 'Asia/Jakarta', 'jakarta': 'Asia/Jakarta', 'bali': 'Asia/Makassar', 'denpasar': 'Asia/Makassar', 'lombok': 'Asia/Makassar',
    'philippines': 'Asia/Manila', 'manila': 'Asia/Manila', 'cebu': 'Asia/Manila',
    'cambodia': 'Asia/Phnom_Penh', 'siem reap': 'Asia/Phnom_Penh', 'phnom penh': 'Asia/Phnom_Penh',
    'laos': 'Asia/Vientiane', 'myanmar': 'Asia/Yangon', 'burma': 'Asia/Yangon',
    'india': 'Asia/Kolkata', 'delhi': 'Asia/Kolkata', 'mumbai': 'Asia/Kolkata', 'goa': 'Asia/Kolkata',
    'maldives': 'Indian/Maldives', 'sri lanka': 'Asia/Colombo', 'nepal': 'Asia/Kathmandu', 'bangladesh': 'Asia/Dhaka', 'pakistan': 'Asia/Karachi',
    'united arab emirates': 'Asia/Dubai', 'uae': 'Asia/Dubai', 'dubai': 'Asia/Dubai', 'abu dhabi': 'Asia/Dubai',
    'saudi arabia': 'Asia/Riyadh', 'qatar': 'Asia/Qatar', 'doha': 'Asia/Qatar', 'bahrain': 'Asia/Bahrain', 'kuwait': 'Asia/Kuwait',
    'oman': 'Asia/Muscat', 'muscat': 'Asia/Muscat',
    'israel': 'Asia/Jerusalem', 'jordan': 'Asia/Amman', 'lebanon': 'Asia/Beirut', 'iraq': 'Asia/Baghdad', 'iran': 'Asia/Tehran',
    'turkey': 'Europe/Istanbul', 'turkiye': 'Europe/Istanbul', 'istanbul': 'Europe/Istanbul',
    'egypt': 'Africa/Cairo', 'cairo': 'Africa/Cairo', 'morocco': 'Africa/Casablanca', 'marrakech': 'Africa/Casablanca',
    'tunisia': 'Africa/Tunis', 'algeria': 'Africa/Algiers',
    'south africa': 'Africa/Johannesburg', 'kenya': 'Africa/Nairobi', 'tanzania': 'Africa/Dar_es_Salaam', 'zanzibar': 'Africa/Dar_es_Salaam',
    'nigeria': 'Africa/Lagos', 'ethiopia': 'Africa/Addis_Ababa', 'ghana': 'Africa/Accra',
    'united kingdom': 'Europe/London', 'england': 'Europe/London', 'scotland': 'Europe/London', 'wales': 'Europe/London',
    'london': 'Europe/London', 'edinburgh': 'Europe/London', 'manchester': 'Europe/London',
    'ireland': 'Europe/Dublin', 'dublin': 'Europe/Dublin', 'iceland': 'Atlantic/Reykjavik', 'reykjavik': 'Atlantic/Reykjavik',
    'portugal': 'Europe/Lisbon', 'lisbon': 'Europe/Lisbon', 'porto': 'Europe/Lisbon',
    'spain': 'Europe/Madrid', 'madrid': 'Europe/Madrid', 'barcelona': 'Europe/Madrid', 'mallorca': 'Europe/Madrid', 'ibiza': 'Europe/Madrid',
    'canary': 'Atlantic/Canary', 'tenerife': 'Atlantic/Canary',
    'france': 'Europe/Paris', 'paris': 'Europe/Paris', 'nice': 'Europe/Paris', 'marseille': 'Europe/Paris', 'lyon': 'Europe/Paris',
    'monaco': 'Europe/Monaco',
    'belgium': 'Europe/Brussels', 'brussels': 'Europe/Brussels', 'netherlands': 'Europe/Amsterdam', 'holland': 'Europe/Amsterdam',
    'amsterdam': 'Europe/Amsterdam', 'luxembourg': 'Europe/Luxembourg',
    'germany': 'Europe/Berlin', 'berlin': 'Europe/Berlin', 'munich': 'Europe/Berlin', 'frankfurt': 'Europe/Berlin',
    'hamburg': 'Europe/Berlin', 'cologne': 'Europe/Berlin',
    'switzerland': 'Europe/Zurich', 'zurich': 'Europe/Zurich', 'geneva': 'Europe/Zurich', 'austria': 'Europe/Vienna', 'vienna': 'Europe/Vienna',
    'italy': 'Europe/Rome', 'rome': 'Europe/Rome', 'roma': 'Europe/Rome', 'milan': 'Europe/Rome', 'milano': 'Europe/Rome',
    'venice': 'Europe/Rome', 'venezia': 'Europe/Rome', 'florence': 'Europe/Rome', 'naples': 'Europe/Rome', 'bologna': 'Europe/Rome',
    'sicily': 'Europe/Rome', 'sardinia': 'Europe/Rome',
    'greece': 'Europe/Athens', 'athens': 'Europe/Athens', 'santorini': 'Europe/Athens', 'mykonos': 'Europe/Athens',
    'cyprus': 'Asia/Nicosia', 'malta': 'Europe/Malta',
    'croatia': 'Europe/Zagreb', 'serbia': 'Europe/Belgrade', 'slovenia': 'Europe/Ljubljana', 'bosnia': 'Europe/Sarajevo',
    'albania': 'Europe/Tirane', 'north macedonia': 'Europe/Skopje',
    'bulgaria': 'Europe/Sofia', 'romania': 'Europe/Bucharest', 'bucharest': 'Europe/Bucharest', 'bucuresti': 'Europe/Bucharest',
    'cluj': 'Europe/Bucharest', 'brasov': 'Europe/Bucharest', 'iasi': 'Europe/Bucharest', 'timisoara': 'Europe/Bucharest',
    'constanta': 'Europe/Bucharest', 'sibiu': 'Europe/Bucharest', 'piatra neamt': 'Europe/Bucharest', 'cfr calatori': 'Europe/Bucharest',
    'hungary': 'Europe/Budapest', 'budapest': 'Europe/Budapest',
    'poland': 'Europe/Warsaw', 'warsaw': 'Europe/Warsaw', 'krakow': 'Europe/Warsaw',
    'czech': 'Europe/Prague', 'czechia': 'Europe/Prague', 'prague': 'Europe/Prague',
    'slovakia': 'Europe/Bratislava', 'denmark': 'Europe/Copenhagen', 'copenhagen': 'Europe/Copenhagen',
    'sweden': 'Europe/Stockholm', 'stockholm': 'Europe/Stockholm',
    'norway': 'Europe/Oslo', 'oslo': 'Europe/Oslo', 'finland': 'Europe/Helsinki', 'estonia': 'Europe/Tallinn',
    'latvia': 'Europe/Riga', 'lithuania': 'Europe/Vilnius',
    'russia': 'Europe/Moscow', 'moscow': 'Europe/Moscow', 'ukraine': 'Europe/Kyiv', 'kyiv': 'Europe/Kyiv', 'kiev': 'Europe/Kyiv',
    'moldova': 'Europe/Chisinau', 'georgia': 'Asia/Tbilisi', 'armenia': 'Asia/Yerevan', 'azerbaijan': 'Asia/Baku',
    'usa': 'America/New_York', 'united states': 'America/New_York', 'new york': 'America/New_York', 'boston': 'America/New_York',
    'miami': 'America/New_York', 'orlando': 'America/New_York', 'washington': 'America/New_York',
    'chicago': 'America/Chicago', 'houston': 'America/Chicago', 'dallas': 'America/Chicago', 'austin': 'America/Chicago',
    'seattle': 'America/Los_Angeles', 'san francisco': 'America/Los_Angeles', 'los angeles': 'America/Los_Angeles',
    'las vegas': 'America/Los_Angeles', 'san diego': 'America/Los_Angeles',
    'canada': 'America/Toronto', 'toronto': 'America/Toronto', 'vancouver': 'America/Vancouver', 'montreal': 'America/Toronto',
    'hawaii': 'Pacific/Honolulu', 'honolulu': 'Pacific/Honolulu', 'mexico': 'America/Mexico_City', 'cancun': 'America/Cancun',
    'cuba': 'America/Havana', 'dominican republic': 'America/Santo_Domingo', 'jamaica': 'America/Jamaica',
    'puerto rico': 'America/Puerto_Rico', 'costa rica': 'America/Costa_Rica', 'panama': 'America/Panama',
    'brazil': 'America/Sao_Paulo', 'sao paulo': 'America/Sao_Paulo', 'rio de janeiro': 'America/Sao_Paulo',
    'argentina': 'America/Argentina/Buenos_Aires', 'buenos aires': 'America/Argentina/Buenos_Aires',
    'chile': 'America/Santiago', 'peru': 'America/Lima', 'lima': 'America/Lima', 'colombia': 'America/Bogota', 'bogota': 'America/Bogota',
    'uruguay': 'America/Montevideo', 'ecuador': 'America/Guayaquil', 'bolivia': 'America/La_Paz', 'venezuela': 'America/Caracas',
    'australia': 'Australia/Sydney', 'sydney': 'Australia/Sydney', 'melbourne': 'Australia/Melbourne', 'brisbane': 'Australia/Brisbane',
    'perth': 'Australia/Perth', 'adelaide': 'Australia/Adelaide', 'gold coast': 'Australia/Brisbane', 'cairns': 'Australia/Brisbane',
    'new zealand': 'Pacific/Auckland', 'auckland': 'Pacific/Auckland', 'queenstown': 'Pacific/Auckland', 'fiji': 'Pacific/Fiji',
    'mongolia': 'Asia/Ulaanbaatar', 'uzbekistan': 'Asia/Tashkent', 'kazakhstan': 'Asia/Almaty',
  };

  // Word-boundary matchers, longest key first ("south korea" before "korea").
  // Plain substring matching would let "nice" match inside "service".
  const PLACE_LOOKUP = Object.keys(TZ_BY_PLACE)
    .sort((a, b) => b.length - a.length)
    .map((k) => ({ key: k, re: new RegExp('\\b' + k.replace(/[-]/g, '\\-') + '\\b'), tz: TZ_BY_PLACE[k] }));

  // First place word found in `text` -> { tz, key }, or null.
  function placeIn(text) {
    const t = norm(text);
    for (const entry of PLACE_LOOKUP) if (entry.re.test(t)) return { tz: entry.tz, key: entry.key };
    return null;
  }

  function tzFromText(text) {
    const hit = placeIn(text);
    if (hit) return hit.tz;
    // Fall back to an exact airport-city match on each comma-separated part
    // ("Oknha Oum Chhay Street, Siem Reap" -> Siem Reap -> its airport's zone).
    for (const part of String(text || '').split(/[,\n]/)) {
      const a = cityAirport(part);
      if (a) return a.tz;
    }
    return null;
  }

  // Exact city-name match only (no fuzzy airport-name matching): safe to run on
  // arbitrary address fragments.
  function cityAirport(text) {
    loadAirports();
    const tokens = placeTokens(text);
    if (!tokens.length || tokens.length > 4) return null;
    const key = tokens.join('');
    if (key.length < 4) return null;
    for (const a of airportIndex) if (a.cityKey === key) return a;
    return null;
  }

  return {
    norm, airport, findAirport, splitTwoAirports, cityAirport, flightMinutes,
    airlineName, airlineCodeIn, hasAirline: (c) => !!AIRLINES[c],
    tzFromText, placeIn,
  };
})();
