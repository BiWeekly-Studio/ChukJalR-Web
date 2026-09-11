import SwiftUI

/// The approved web wordmark, exported by npm run design:brand.
/// Shares the original glyphs, tilt, integrated football and navy/lime palette.
struct PlateLogo: View {
    var width: CGFloat = 200
    var tone: Tone = .onLight
    enum Tone { case onLight, onDark }
    var body: some View {
        Image(tone == .onDark ? "WordmarkDark" : "WordmarkLight")
            .resizable().interpolation(.high).aspectRatio(contentMode: .fit)
            .frame(width: width, height: width * 192 / 392)
            .accessibilityLabel("축잘알")
    }
}
