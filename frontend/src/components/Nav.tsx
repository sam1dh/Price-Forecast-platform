import AddObservation from "./AddObservation";

/** Static nav (design reference), plus the small AddObservation form. */
export default function Nav({ nextMonth }: { nextMonth?: string | null }) {
  return (
    <nav className="nav" aria-label="Primary">
      <a className="nav__mark" href="#">
        <i aria-hidden="true"></i>Pricewatch
      </a>
      <ul>
        <li><a href="#" aria-current="page">Overview</a></li>
        <li><a href="#scenario">Scenarios</a></li>
        <li><a href="#models">Models</a></li>
        <li><a href="#quality">Data quality</a></li>
      </ul>
      <AddObservation nextMonth={nextMonth} />
      <button className="btn" type="button">Export</button>
    </nav>
  );
}
