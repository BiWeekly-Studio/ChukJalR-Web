import SwiftUI
import PhotosUI

/// 프로필 편집 — 사진과 닉네임.
///
/// 채팅과 순위표에 사람이 드러나는 앱이라, 이름과 얼굴을 바꿀 수 있어야 한다.
/// 저장은 두 갈래(사진 업로드 · 닉네임 RPC)이고, 한쪽이 실패해도 다른 쪽은 남긴다 —
/// 사진은 올라갔는데 닉네임이 중복이라 통째로 되돌리면 사용자가 다시 고르게 된다.
struct ProfileEditView: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var dismiss

    @State private var handle = ""
    @State private var picked: PhotosPickerItem?
    /// 고른 사진의 미리보기. 저장 전까지는 서버에 올리지 않는다.
    @State private var preview: UIImage?
    @State private var removePhoto = false
    @State private var saving = false
    @State private var error: String?

    private var trimmed: String { handle.trimmingCharacters(in: .whitespaces) }
    private var handleChanged: Bool { trimmed != store.me.handle }
    private var photoChanged: Bool { preview != nil || removePhoto }
    private var canSave: Bool {
        !saving && (photoChanged || (handleChanged && trimmed.count >= 2 && trimmed.count <= 12))
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 22) {
                    photoSection.padding(.top, 12)
                    handleSection
                    if let error {
                        Text(error)
                            .font(T.body(12)).foregroundStyle(T.cool)
                            .multilineTextAlignment(.center)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                .padding(.horizontal, 20).padding(.bottom, 24)
            }
            .background(T.paper)
            .navigationTitle("프로필 편집")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("취소") { dismiss() }.font(T.body(14))
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("저장", action: save)
                        .font(T.body(14, .heavy))
                        .disabled(!canSave)
                }
            }
        }
        .onAppear { handle = store.me.handle }
        .onChange(of: picked) { item in
            guard let item else { return }
            Task { await load(item) }
        }
    }

    // MARK: 사진

    private var photoSection: some View {
        VStack(spacing: 12) {
            Avatar(url: removePhoto ? nil : store.me.avatarUrl,
                   initial: store.me.handle, size: 96, image: preview)

            HStack(spacing: 8) {
                PhotosPicker(selection: $picked, matching: .images, photoLibrary: .shared()) {
                    Text("사진 바꾸기")
                        .font(T.body(13, .heavy)).foregroundStyle(.white)
                        .padding(.horizontal, 16).frame(height: 38)
                        .background(T.gradAccent, in: Capsule())
                }
                if store.me.avatarUrl != nil || preview != nil {
                    Button {
                        preview = nil
                        picked = nil
                        removePhoto = true
                    } label: {
                        Text("지우기")
                            .font(T.body(13, .semibold)).foregroundStyle(T.ink2)
                            .padding(.horizontal, 16).frame(height: 38)
                            .background(T.card2, in: Capsule())
                    }
                }
            }
        }
        .frame(maxWidth: .infinity)
    }

    private func load(_ item: PhotosPickerItem) async {
        guard let data = try? await item.loadTransferable(type: Data.self),
              let image = UIImage(data: data) else {
            error = "사진을 읽지 못했어요."
            return
        }
        preview = image
        removePhoto = false
    }

    // MARK: 닉네임

    private var handleSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("닉네임").font(T.display(13, .heavy))
                Spacer()
                Text("\(trimmed.count)/12")
                    .font(T.num(11))
                    .foregroundStyle(trimmed.count > 12 ? T.cool : T.ink3)
            }
            TextField("닉네임", text: $handle)
                .font(T.body(15))
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .padding(.horizontal, 16).frame(height: 50)
                .background(T.card, in: RoundedRectangle(cornerRadius: 14))
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(T.line, lineWidth: 1.5))
            Text("랭킹과 채팅에 이 이름으로 보여요. 7일에 한 번 바꿀 수 있어요.")
                .font(T.body(11)).foregroundStyle(T.ink3)
        }
    }

    // MARK: 저장

    private func save() {
        saving = true
        error = nil
        Task {
            var failed: String?

            if let preview, let jpeg = Self.jpeg(preview) {
                do { try await store.setAvatar(jpeg) } catch { failed = error.localizedDescription }
            } else if removePhoto {
                do { try await store.removeAvatar() } catch { failed = error.localizedDescription }
            }

            if handleChanged {
                do { try await store.setHandle(trimmed) } catch { failed = error.localizedDescription }
            }

            saving = false
            if let failed {
                error = failed
            } else {
                dismiss()
            }
        }
    }

    /// 원본을 그대로 올리면 몇 MB 다. 버킷 상한이 1MB 이기도 하고, 96px 로 보여줄
    /// 사진에 그만한 화질이 필요하지도 않다. 정사각으로 잘라 512px 로 줄인다.
    static func jpeg(_ image: UIImage, side: CGFloat = 512) -> Data? {
        let source = image.fixedOrientation()
        let shorter = min(source.size.width, source.size.height)
        let crop = CGRect(
            x: (source.size.width - shorter) / 2,
            y: (source.size.height - shorter) / 2,
            width: shorter, height: shorter)
        guard let cg = source.cgImage?.cropping(to: crop.applying(
            CGAffineTransform(scaleX: source.scale, y: source.scale))) else { return nil }

        let square = UIImage(cgImage: cg)
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: side, height: side))
        let resized = renderer.image { _ in
            square.draw(in: CGRect(x: 0, y: 0, width: side, height: side))
        }
        return resized.jpegData(compressionQuality: 0.82)
    }
}

private extension UIImage {
    /// 카메라 사진은 회전 정보만 담고 픽셀은 그대로다. 자르기 전에 실제로 돌려놔야
    /// 옆으로 누운 얼굴이 나오지 않는다.
    func fixedOrientation() -> UIImage {
        guard imageOrientation != .up else { return self }
        let renderer = UIGraphicsImageRenderer(size: size)
        return renderer.image { _ in draw(in: CGRect(origin: .zero, size: size)) }
    }
}

/// 프로필 사진. 없으면 닉네임 첫 글자로 떨어진다 — 빈 원을 그리지 않는다.
struct Avatar: View {
    let url: String?
    let initial: String
    var size: CGFloat = 34
    /// 아직 안 올린 미리보기가 있으면 그걸 먼저 그린다
    var image: UIImage?

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image).resizable().scaledToFill()
            } else if let url, let link = URL(string: url) {
                AsyncImage(url: link) { phase in
                    if let img = phase.image { img.resizable().scaledToFill() } else { fallback }
                }
            } else {
                fallback
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
    }

    private var fallback: some View {
        ZStack {
            T.gradAccent
            Text(String(initial.prefix(1)))
                .font(T.display(size * 0.4, .heavy)).foregroundStyle(.white)
        }
    }
}
