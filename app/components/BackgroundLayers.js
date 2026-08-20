export default function BackgroundLayers({ layerAImage, layerBImage, frontLayer }) {
  return (
    <>
      <div
        className={`bg-layer ${frontLayer === 'a' ? 'visible' : ''}`}
        style={{ backgroundImage: layerAImage ? `url(${layerAImage})` : 'none' }}
      />
      <div
        className={`bg-layer ${frontLayer === 'b' ? 'visible' : ''}`}
        style={{ backgroundImage: layerBImage ? `url(${layerBImage})` : 'none' }}
      />
      <div className="bg-scrim" />
    </>
  );
}
