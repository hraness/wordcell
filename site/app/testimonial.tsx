/** A customer quote with attribution, set as a pull quote. Reusable across product sites. */
export function Testimonial({ quote, name, role, company }: {
  quote: React.ReactNode;
  name: string;
  role?: string;
  company?: string;
}) {
  return (
    <figure aria-label={`Testimonial from ${name}`} className="testimonial">
      <blockquote className="testimonial__quote">
        <p>{quote}</p>
      </blockquote>
      <figcaption className="testimonial__attribution">
        <span className="testimonial__name">{name}</span>
        {role !== undefined && company !== undefined ? (
          <span className="testimonial__role">{role}, {company}</span>
        ) : null}
      </figcaption>
    </figure>
  );
}
