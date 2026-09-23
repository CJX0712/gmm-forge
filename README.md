# gmm-forge

<p align="center">
  <a href="https://github.com/CJX0712/gmm-forge/actions/workflows/ci.yml"><img src="https://github.com/CJX0712/gmm-forge/actions/workflows/ci.yml/badge.svg" alt="ci"></a>
  <a href="https://github.com/CJX0712/gmm-forge/releases"><img src="https://img.shields.io/github/v/release/CJX0712/gmm-forge?sort=semver" alt="release"></a>
  <a href="https://github.com/CJX0712/gmm-forge/blob/main/LICENSE"><img src="https://img.shields.io/github/license/CJX0712/gmm-forge" alt="license"></a>
  <img src="https://img.shields.io/badge/author-%E6%99%A8%E6%98%9F-1f6feb" alt="author">
</p>

手写高斯混合模型 (Gaussian Mixture Model) + 期望最大化 (EM) 算法，单文件 HTML、零依赖、零构建。纯 JavaScript 实现，浏览器内可交互运行，并带 8 项硬不变量自检。

> Round 21 of the **forge** series — 纯 JS 手写 ML/AI 算法单文件可视化。

## 算法要点

- **采样**：用 Cholesky 分解从已知 GMM 生成数据（用于金标准交叉验证）。
- **E 步**：在 log 空间用 `logsumexp` 计算责任度 γ，数值稳定、无下溢。
- **M 步**：用 γ 更新混合权重、均值、协方差（带极小 ridge 防奇异）。
- **EM 循环**：多次重启取最高对数似然 (LL)，规避局部最优。

## 招牌不变量（硬金标准）

| # | 不变量 | 含义 |
|---|--------|------|
| ① | **对数似然单调非减** | EM 收敛定理：每轮 E→M 后 LL 不下降 |
| ② | **1D 参数精确还原** | 用已知 μ/σ 造数据，EM 收敛后精确还原真值 |
| ③ | 责任度每行归一 (Σ=1) | E 步归一化正确 |
| ④ | 权重和=1 且 Nₖ=N·wₖ | 后验计数一致 |
| ⑤ | 收敛不动点 | 额外迭代责任度几乎不变 |
| ⑥ | 协方差对称且半正定 | 矩阵合法性 |
| ⑦ | 缩放等变 | 数据 ×c → 分配不变、参数 ×c |
| ⑧ | 2 成分 LL > 1 成分 LL | 在双簇数据上模型更优 |

## 运行

直接用浏览器打开 `index.html`，或：

```bash
node _smoke.js   # 无头复跑 8/8 不变量
```

## 验证结果（最近一次）

```
PASS ① LL monotonic non-decreasing      | min increment 0.00e+0
PASS ② 1D exact parameter recovery      | max|μ-μ*|=0.0399 max|σ-σ*|=0.0121
PASS ③ responsibilities sum to 1         | violations 0
PASS ④ weights sum to 1 and Nk=N·w_k     | Σw=1.000000
PASS ⑤ convergence fixed point          | maxΔγ=0.00e+0
PASS ⑥ covariances symmetric and PSD    | symmetric ✓
PASS ⑦ scale equivariance               | misassign 0 μratio 3.700 σratio 3.700
PASS ⑧ 2-comp LL > 1-comp LL            | LL2=-1928.61 > LL1=-2650.58
RESULT: 8/8 ALL PASS ✅
```

## License

MIT — see [LICENSE](LICENSE).
