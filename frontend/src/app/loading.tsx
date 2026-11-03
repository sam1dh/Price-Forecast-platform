export default function Loading() {
  return (
    <>
      <div className="band">
        <header className="wrap">
          <nav className="nav" aria-label="Primary">
            <a className="nav__mark" href="#"><i aria-hidden="true"></i>Pricewatch</a>
          </nav>
          <section className="hero" aria-label="Loading forecast">
            <div>
              <h1>Forecast</h1>
              <div className="hero__num" aria-hidden="true">—</div>
            </div>
          </section>
          <div className="card" role="status">
            <div className="card__h"><h2>Monthly price and 12-month forecast</h2><p>The forecast is a band, not a line.</p></div>
            <div className="c-svg-skeleton" aria-hidden="true">
              <div className="sk sk-line" style={{ width: "70%" }} />
              <div className="sk sk-area" />
              <div className="sk sk-line" style={{ width: "45%" }} />
            </div>
          </div>
        </header>
      </div>
    </>
  );
}
