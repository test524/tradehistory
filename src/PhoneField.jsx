import { COUNTRIES, flag } from './countries'

// Controlled country-code select + national number input
export default function PhoneField({ country, phone, onCountry, onPhone, invalid, describedBy }) {
  return (
    <div className="login__phone">
      <select
        aria-label="Country code"
        value={country}
        onChange={(e) => onCountry(e.target.value)}
        className="login__input login__select"
      >
        {COUNTRIES.map(([iso, name, dial]) => (
          <option key={iso} value={iso} title={name}>
            {flag(iso)} +{dial}
          </option>
        ))}
      </select>
      <input
        id="phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        placeholder="Phone number"
        value={phone}
        onChange={(e) => onPhone(e.target.value)}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className="login__input"
      />
    </div>
  )
}
