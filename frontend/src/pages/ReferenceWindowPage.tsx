import ReferenceImageViewer from "../components/session/ReferenceImageViewer";

interface ReferenceWindowPageProps {
  referenceId: string;
}

/**
 * The whole of the reference window: the image and nothing else.
 *
 * It deliberately has no chrome. The window is there to be looked at while
 * drawing in another one, so every pixel of it should be the reference —
 * anything else would be taking back the room the window was opened to gain.
 */
function ReferenceWindowPage({ referenceId }: ReferenceWindowPageProps) {
  return (
    <div className="reference-window" data-testid="reference-window">
      <ReferenceImageViewer referenceId={referenceId} />
    </div>
  );
}

export default ReferenceWindowPage;
