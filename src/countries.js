// [ISO code, name, dial code]
export const COUNTRIES = [
  ['IN', 'India', '91'],
  ['US', 'United States', '1'],
  ['CA', 'Canada', '1'],
  ['GB', 'United Kingdom', '44'],
  ['AU', 'Australia', '61'],
  ['AE', 'United Arab Emirates', '971'],
  ['SA', 'Saudi Arabia', '966'],
  ['SG', 'Singapore', '65'],
  ['MY', 'Malaysia', '60'],
  ['PK', 'Pakistan', '92'],
  ['BD', 'Bangladesh', '880'],
  ['LK', 'Sri Lanka', '94'],
  ['NP', 'Nepal', '977'],
  ['DE', 'Germany', '49'],
  ['FR', 'France', '33'],
  ['IT', 'Italy', '39'],
  ['ES', 'Spain', '34'],
  ['NL', 'Netherlands', '31'],
  ['CH', 'Switzerland', '41'],
  ['SE', 'Sweden', '46'],
  ['IE', 'Ireland', '353'],
  ['RU', 'Russia', '7'],
  ['CN', 'China', '86'],
  ['JP', 'Japan', '81'],
  ['KR', 'South Korea', '82'],
  ['HK', 'Hong Kong', '852'],
  ['ID', 'Indonesia', '62'],
  ['PH', 'Philippines', '63'],
  ['TH', 'Thailand', '66'],
  ['VN', 'Vietnam', '84'],
  ['NZ', 'New Zealand', '64'],
  ['ZA', 'South Africa', '27'],
  ['NG', 'Nigeria', '234'],
  ['KE', 'Kenya', '254'],
  ['EG', 'Egypt', '20'],
  ['TR', 'Turkey', '90'],
  ['BR', 'Brazil', '55'],
  ['MX', 'Mexico', '52'],
  ['AR', 'Argentina', '54'],
  ['QA', 'Qatar', '974'],
  ['KW', 'Kuwait', '965'],
  ['OM', 'Oman', '968'],
  ['BH', 'Bahrain', '973'],
]

export const flag = (iso) =>
  String.fromCodePoint(...[...iso].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))

// Returns "+<dial><national>" or null if it doesn't look valid
export function toE164(country, phone) {
  const dial = COUNTRIES.find(([iso]) => iso === country)[2]
  const national = phone.replace(/\D/g, '').replace(/^0+/, '')
  if (national.length < 6 || dial.length + national.length > 15) return null
  return `+${dial}${national}`
}
