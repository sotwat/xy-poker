file_path = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/App.css'

with open(file_path, 'r') as file:
    content = file.read()

# Exact chunk to replace (lines 704 to 765 in App.css)
old_chunk = """.coin.flipping {
  animation: coin-spin-3d 2.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}

/* 静止状態: 最終的な回転角度で停止 */
.coin.flipped.winner-0 {
  transform: rotateY(0deg);
}

.coin.flipped.winner-1 {
  transform: rotateY(180deg);
}

/* コイン前面: 青 */
.coin-front {
  width: 160px;
  height: 160px;
  border-radius: 50%;
  position: absolute;
  top: 50%;
  left: 50%;
  background: radial-gradient(circle at 30% 30%, #60a5fa, #2563eb);
  border: 6px solid #1e40af;
  box-shadow:
    0 10px 30px rgba(0, 0, 0, 0.4),
    inset 0 2px 5px rgba(255, 255, 255, 0.5),
    inset 0 -2px 5px rgba(0, 0, 0, 0.3),
    inset -30px -30px 60px rgba(0, 0, 0, 0.2);
  transform: translate(-50%, -50%) translateZ(8px);
  backface-visibility: hidden;
}

/* コイン背面: 赤 */
.coin-back {
  width: 160px;
  height: 160px;
  border-radius: 50%;
  position: absolute;
  top: 50%;
  left: 50%;
  background: radial-gradient(circle at 30% 30%, #f87171, #dc2626);
  border: 6px solid #991b1b;
  box-shadow:
    0 10px 30px rgba(0, 0, 0, 0.4),
    inset 0 2px 5px rgba(255, 255, 255, 0.5),
    inset 0 -2px 5px rgba(0, 0, 0, 0.3),
    inset -30px -30px 60px rgba(0, 0, 0, 0.2);
  transform: translate(-50%, -50%) rotateY(180deg) translateZ(-8px);
  backface-visibility: hidden;
}

/* コイン側面 - 不要なため削除 */

/* 3D回転アニメーション: Y軸で720度（2周）回転 */
@keyframes coin-spin-3d {
  0% {
    transform: rotateY(0deg);
  }
  100% {
    transform: rotateY(720deg);
  }
}"""

new_chunk = """.coin.flipping.winner-0 {
  animation: coin-spin-blue 2.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}

.coin.flipping.winner-1 {
  animation: coin-spin-red 2.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}

/* 静止状態: 最終的な回転角度で停止 */
.coin.flipped.winner-0 {
  transform: rotateY(1080deg);
}

.coin.flipped.winner-1 {
  transform: rotateY(900deg);
}

/* コイン前面: 青 */
.coin-front {
  width: 160px;
  height: 160px;
  border-radius: 50%;
  position: absolute;
  top: 50%;
  left: 50%;
  background: radial-gradient(circle at 30% 30%, #60a5fa, #2563eb);
  border: 6px solid #1e40af;
  box-shadow:
    0 10px 30px rgba(0, 0, 0, 0.4),
    inset 0 2px 5px rgba(255, 255, 255, 0.5),
    inset 0 -2px 5px rgba(0, 0, 0, 0.3),
    inset -30px -30px 60px rgba(0, 0, 0, 0.2);
  transform: translate(-50%, -50%) translateZ(8px);
  backface-visibility: hidden;
}

/* コイン背面: 赤 */
.coin-back {
  width: 160px;
  height: 160px;
  border-radius: 50%;
  position: absolute;
  top: 50%;
  left: 50%;
  background: radial-gradient(circle at 30% 30%, #f87171, #dc2626);
  border: 6px solid #991b1b;
  box-shadow:
    0 10px 30px rgba(0, 0, 0, 0.4),
    inset 0 2px 5px rgba(255, 255, 255, 0.5),
    inset 0 -2px 5px rgba(0, 0, 0, 0.3),
    inset -30px -30px 60px rgba(0, 0, 0, 0.2);
  transform: translate(-50%, -50%) rotateY(180deg) translateZ(-8px);
  backface-visibility: hidden;
}

/* コイン側面 - 不要なため削除 */

/* 3D回転アニメーション: Y軸で各勝者ごとの角度（青1080度 / 赤900度）に回転 */
@keyframes coin-spin-blue {
  0% {
    transform: rotateY(0deg);
  }
  100% {
    transform: rotateY(1080deg);
  }
}

@keyframes coin-spin-red {
  0% {
    transform: rotateY(0deg);
  }
  100% {
    transform: rotateY(900deg);
  }
}"""

if old_chunk in content:
    content = content.replace(old_chunk, new_chunk)
    with open(file_path, 'w') as file:
        file.write(content)
    print("Success: App.css coin animation replaced cleanly.")
else:
    # Try with unix newlines normalization just in case
    content_norm = content.replace('\r\n', '\n')
    old_chunk_norm = old_chunk.replace('\r\n', '\n')
    new_chunk_norm = new_chunk.replace('\r\n', '\n')
    if old_chunk_norm in content_norm:
        content_norm = content_norm.replace(old_chunk_norm, new_chunk_norm)
        with open(file_path, 'w') as file:
            file.write(content_norm)
        print("Success: App.css coin animation replaced cleanly (normalized).")
    else:
        print("Error: Could not match exact CSS chunk in App.css.")
