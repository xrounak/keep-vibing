// Small always-on vinyl-style spinning disc, corner-anchored, links to
// Instagram. No popup timing to manage — just sits there and spins.
export default function SpinningDisc() {
  return (
    <a
      href="https://www.instagram.com/unknowngmr02/"
      target="_blank"
      rel="noopener noreferrer"
      className="spinning-disc"
      title="@unknowngmr02"
    >
      <img src="/me.jpg" alt="@unknowngmr02" />
    </a>
  );
}
