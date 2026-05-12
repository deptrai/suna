# Chainlens Tokenomics Whitepaper: Nền kinh tế AI DePIN-lite

## 1. Tóm tắt dự án (Executive Summary)

Chainlens đang tiên phong xây dựng **Nền kinh tế AI DePIN-lite (Mạng lưới hạ tầng vật lý phi tập trung)**. Bằng cách khuyến khích người dùng sử dụng API key cá nhân (BYOK - Bring Your Own Key) và chạy các node tính toán cục bộ (Local Ollama), Chainlens giảm thiểu đáng kể chi phí hạ tầng tập trung, đồng thời trao thưởng cho những người đóng góp bằng token `$CLENS`.

Sách trắng (Whitepaper) này trình bày chi tiết nền tảng toán học của cơ chế đồng thuận **Proof of Contribution (PoC) - Bằng chứng Đóng góp**, phân bổ token, và các cơ chế giảm phát được thúc đẩy bởi hệ thống proxy Model-as-a-Service (MaaS).

---

## 2. Cơ chế Bằng chứng Đóng góp (Proof of Contribution - PoC)

Người đóng góp được nhận thưởng bằng **Lens Points ($P$)** off-chain trong mỗi Kỷ nguyên (Epoch). Cuối mỗi Kỷ nguyên, điểm này sẽ được chuyển đổi thành token `$CLENS` dựa trên tỷ lệ đóng góp của họ so với tổng số điểm của toàn mạng lưới.

### 2.1 Công thức tính điểm

Tổng số điểm mà một node/người dùng $i$ kiếm được trong một phiên $t$ được tính như sau:

$$ P_{i,t} = T_{base} \times M_{model} \times M_{quality} \times M_{uptime} $$

#### a) Token cơ sở ($T_{base}$)
Khối lượng tuyệt đối của các token AI được xử lý (Input + Output).
$$ T_{base} = T_{input} + (T_{output} \times 1.5) $$
*(Token đầu ra được tính hệ số cao hơn do chi phí tính toán lớn hơn).*

#### b) Hệ số Model ($M_{model}$)
Khuyến khích người dùng chạy hoặc cung cấp API key cho các model mạnh mẽ hơn.
- **Tier 1 (Light):** Llama 3 8B, GPT-3.5 $\rightarrow M_{model} = 1.0$
- **Tier 2 (Medium):** Qwen 3.6 27B, GPT-4o-mini $\rightarrow M_{model} = 1.5$
- **Tier 3 (Heavy/Commercial):** Claude 3.5 Sonnet, GPT-4o $\rightarrow M_{model} = 3.0$

#### c) Hệ số Chất lượng ($M_{quality}$)
Dữ liệu cung cấp cho mạng lưới (ví dụ: thông qua các truy vấn RAG) sẽ được đánh giá bởi phản hồi của cộng đồng.
$$ M_{quality} = 1.0 + (0.05 \times \text{Net Upvotes}) $$
*(Được giới hạn ở mức tối đa $M_{quality} = 2.0$ để chống lại các cuộc tấn công sybil upvote).*

#### d) Hệ số Uptime ($M_{uptime}$)
Áp dụng chủ yếu cho các node Local Ollama. Các node duy trì uptime >99% trong một khung thời gian 24 giờ sẽ nhận được hệ số nhân để khuyến khích sự ổn định của mạng lưới.
- Uptime $\ge 99\%$ $\rightarrow M_{uptime} = 1.2$
- Uptime $< 99\%$ $\rightarrow M_{uptime} = 1.0$

---

## 3. Phân phối Token theo Kỷ nguyên (Epoch)

Việc chuyển đổi từ Lens Points sang `$CLENS` diễn ra vào cuối mỗi Kỷ nguyên (Epoch kéo dài 30 ngày).

### 3.1 Đường cong phát hành (Emission Curve)
Tổng lượng `$CLENS` phát hành trong Kỷ nguyên $E$ tuân theo một đường cong giảm phát (decay curve) để ngăn chặn siêu lạm phát, tương tự như cơ chế halving của Bitcoin nhưng mượt mà hơn.

$$ Emission(E) = Emission(0) \times (0.95)^{E-1} $$

Trong đó $Emission(0)$ là ngân sách thưởng được phân bổ ban đầu cho Kỷ nguyên 1.

### 3.2 Tính toán phần thưởng theo tỷ lệ
Phần thưởng token $R_i$ của người dùng $i$ cho Kỷ nguyên $E$ là tỷ lệ phần của họ trong tổng quỹ điểm:

$$ R_i = \left( \frac{\sum P_{i}}{\sum P_{global}} \right) \times Emission(E) $$

---

## 4. Phân bổ Tokenomics ($CLENS)

Tổng Cung Tối Đa (Total Maximum Supply): **1.000.000.000 $CLENS**

| Hạng mục (Category) | Tỷ lệ | Số lượng | Lịch Trình Mở Khóa (Vesting Schedule) |
| :--- | :--- | :--- | :--- |
| **Khai thác Mạng lưới / Thưởng Cộng đồng** | 45% | 450M | Phát hành theo Kỷ nguyên (Đường cong giảm phát trong 5 năm). |
| **Team & Cốt lõi** | 20% | 200M | Khóa 12 tháng, trả dần đều trong 24 tháng. |
| **Nhà đầu tư & Backers** | 15% | 150M | Khóa 6 tháng, trả dần đều trong 18 tháng. |
| **Hệ sinh thái & Quỹ dự trữ (Treasury)** | 10% | 100M | Mở khóa khi cần cho thanh khoản DEX/CEX & các khoản tài trợ (grants). |
| **Airdrop Khởi tạo (Alpha Testers)** | 10% | 100M | Mở khóa 50% tại TGE, 50% trả dần trong 6 tháng dựa trên tỷ lệ duy trì (retention). |

---

## 5. Cơ chế Giảm phát & Tích lũy Giá trị

Chainlens thu thập giá trị thông qua **Cổng LLM Proxy (MaaS)**. Các nhà phát triển và người dùng doanh nghiệp sẽ thanh toán cho việc sử dụng API bằng tiền pháp định (fiat/USDT) hoặc `$CLENS`.

### 5.1 Cơ chế Đốt token "Hold-and-Settle"
Đối với mỗi yêu cầu API được xử lý thông qua cổng MaaS:
1. **Dự trữ (Reserve):** Các Credit nội bộ bị khóa lại.
2. **Thực thi (Execute):** Yêu cầu được đáp ứng thông qua các Node Cộng đồng hoặc dự phòng qua Cloud.
3. **Quyết toán & Đốt (Settle & Burn):**
   - 70% doanh thu được phân chia cho Nhà cung cấp tính toán (Compute Provider - Node/người dùng BYOK).
   - 30% doanh thu được Giao thức (Protocol) thu giữ.
   - **Phân chia Doanh thu Giao thức:** 50% đi vào Quỹ dự trữ (Treasury) cho các hoạt động vận hành, **50% bị Đốt vĩnh viễn (Mua lại và Đốt - Buy-back and Burn)** từ thị trường mở.

### 5.2 Công thức Đốt (Burn Formula)
$$ Burn_{monthly} = \sum_{req} \left( Fee_{req} \times 0.30 \times 0.50 \right) $$

Áp lực mua liên tục này đảm bảo rằng khi việc sử dụng mạng lưới tăng lên, nguồn cung lưu hành của `$CLENS` sẽ giảm đi một cách nghiêm ngặt, thúc đẩy giá trị cho những người nắm giữ dài hạn và những người đóng góp tích cực.
