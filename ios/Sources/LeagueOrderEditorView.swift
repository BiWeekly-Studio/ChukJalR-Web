import SwiftUI

struct LeagueOrderEditorView: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var dismiss
    private let initial: [Int]
    @State private var draft: [Int]
    @State private var major: Bool
    @State private var busy = false
    @State private var error: String?

    init(order: [Int], major: Bool) {
        initial = order
        _draft = State(initialValue: order)
        _major = State(initialValue: major)
    }

    private var visible: [Int] { draft.filter { CompetitionCatalog.isMajor($0) == major } }

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 16) {
                Text("자주 보는 리그부터 만나보세요.\n화살표를 눌러 각 분류 안에서 순서를 바꿀 수 있어요.")
                    .font(T.body(12)).foregroundStyle(T.ink3).padding(.horizontal, 20)
                Picker("대회 분류", selection: $major) {
                    Text("메이저 대회").tag(true)
                    Text("기타 대회").tag(false)
                }.pickerStyle(.segmented).padding(.horizontal, 20).disabled(busy)
                List {
                    ForEach(Array(visible.enumerated()), id: \.element) { index, id in
                        HStack(spacing: 10) {
                            Text(String(format: "%02d", index + 1)).font(T.num(11)).foregroundStyle(T.ink3)
                            Text(store.league(id).name).font(T.body(13, .semibold)).foregroundStyle(T.ink)
                            Spacer(minLength: 0)
                            moveButton(id, index: index, direction: -1)
                            moveButton(id, index: index, direction: 1)
                        }.listRowBackground(T.paper)
                    }
                    if visible.isEmpty {
                        Text("아직 등록된 대회가 없어요.").font(T.body(13)).foregroundStyle(T.ink3)
                            .listRowBackground(T.paper)
                    }
                }.listStyle(.plain).scrollContentBackground(.hidden)
            }
            .padding(.top, 12)
            .background(T.paper)
            .navigationTitle("리그 순서 편집")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("취소") { dismiss() }.disabled(busy)
                }
            }
            .safeAreaInset(edge: .bottom) {
                VStack(spacing: 10) {
                    if let error { Text(error).font(T.body(12)).foregroundStyle(T.cool) }
                    Button("기본 순서로 되돌리기") {
                        draft = CompetitionCatalog.ordered(store.leagues, preferred: CompetitionCatalog.majorIds).map(\.id)
                        error = nil
                    }.font(T.body(12)).foregroundStyle(T.ink3).frame(minHeight: 36).disabled(busy)
                    Button {
                        guard !busy else { return }
                        busy = true
                        error = nil
                        Task {
                            do {
                                try await store.saveLeagueOrder(draft)
                                dismiss()
                            } catch {
                                self.error = "순서를 저장하지 못했어요. 연결을 확인하고 다시 시도해주세요."
                                busy = false
                            }
                        }
                    } label: {
                        Text(busy ? "저장 중…" : "순서 저장").font(T.body(15, .bold))
                            .frame(maxWidth: .infinity, minHeight: 50)
                            .foregroundStyle(.white)
                            .background(T.ink, in: RoundedRectangle(cornerRadius: 14))
                            .opacity(busy || draft == initial ? 0.35 : 1)
                    }.disabled(busy || draft == initial)
                }.padding(.horizontal, 20).padding(.bottom, 12).background(T.paper)
            }
        }.interactiveDismissDisabled(busy)
    }

    private func moveButton(_ id: Int, index: Int, direction: Int) -> some View {
        Button {
            let neighbor = visible[index + direction]
            if let from = draft.firstIndex(of: id), let to = draft.firstIndex(of: neighbor) {
                withAnimation(.easeInOut(duration: 0.15)) { draft.swapAt(from, to) }
                error = nil
                Haptics.tap()
            }
        } label: {
            Image(systemName: direction < 0 ? "arrow.up" : "arrow.down")
                .font(.system(size: 14, weight: .semibold))
                .frame(width: 44, height: 44)
                .background(T.card, in: RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.borderless)
        .foregroundStyle(T.ink)
        .disabled(busy || index + direction < 0 || index + direction >= visible.count)
        .accessibilityLabel("\(store.league(id).name) \(direction < 0 ? "위로" : "아래로") 이동")
    }
}
