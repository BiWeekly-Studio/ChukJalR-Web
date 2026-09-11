import SwiftUI
import WebKit

struct LegalView: View {
    @Environment(\.dismiss) private var dismiss
    let page: String
    var body: some View {
        NavigationStack {
            LegalDocument(page: page)
                .navigationTitle(page == "privacy" ? "개인정보 처리방침" : "이용약관")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("닫기") { dismiss() } } }
        }
    }
}
private struct LegalDocument: UIViewRepresentable {
    let page: String
    func makeUIView(context: Context) -> WKWebView {
        let view = WKWebView()
        if let url = Bundle.main.url(forResource: page, withExtension: "html") {
            view.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        }
        return view
    }
    func updateUIView(_ view: WKWebView, context: Context) {}
}
