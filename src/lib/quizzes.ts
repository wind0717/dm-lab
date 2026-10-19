// ============================================================
// 题库 —— 各模块「随堂测」题目
// ============================================================
// 出题原则（重要，别改坏）：
//
// 1. **答案必须与平台实现一致**。写之前先跑一遍算法拿真实数字，
//    不能"看起来对"就写。比如熵、GINI、支持度的具体数值，
//    都来自 src/lib 里的实际计算结果。
//
// 2. **每道错题都要有解析**，且解析要讲「为什么」而非重复答案。
//    goFurther 字段指向具体的实验操作，让学生能立刻验证。
//
// 3. **覆盖常见的错误认知**，不只是考记忆。比如：
//    - 高支持度 ≠ 有价值（要看 lift）
//    - 准确率高不代表模型好（类别不均时会骗人）
//    - K-Means 要先标准化（量纲影响欧氏距离）
//
// 4. 数值题的选项设计成「差一点点」的形式，逼学生真算。
// ============================================================

import type { QuizQuestion } from '@/components/Quiz'

// ------------------------------------------------------------
// 1. 理论基础
// ------------------------------------------------------------
export const theoryQuiz: QuizQuestion[] = [
  {
    id: 't1',
    type: 'single',
    question: '一个数据集中 95% 的样本是 A 类，5% 是 B 类。某模型把所有样本都预测为 A 类，它的准确率是多少？这说明什么？',
    options: [
      { text: '95%，说明模型很好', correct: false },
      { text: '95%，但 B 类的召回率为 0，模型对少数类完全无效', correct: true,
        hint: '这就是"准确率陷阱"：全猜多数类也能拿高分。' },
      { text: '50%，因为模型什么都没学到', correct: false },
      { text: '5%，因为只识别出 B 类', correct: false },
    ],
    explanation:
      '全猜多数类时准确率就是多数类的占比（95%），但 B 类一条都没抓到，召回率为 0。' +
      '所以在类别极不均衡时必须看召回率、F1、混淆矩阵，而不能只看准确率。',
    goFurther: '去「分类实验 → 多方法对比工作台」，把数据集换成 300 行的那个，观察混淆矩阵里的零值。',
  },
  {
    id: 't2',
    type: 'multiple',
    question: '关于熵（Entropy），下列说法正确的有哪些？',
    options: [
      { text: '熵衡量的是一个集合的"混乱程度"', correct: true },
      { text: '纯度越高，熵越小', correct: true },
      { text: 'n 个类完全均匀分布时熵最大，等于 log₂n', correct: true },
      { text: '只要样本数量多，熵就会大', correct: false,
        hint: '熵只与各类占比有关，与绝对数量无关。' },
    ],
    explanation:
      '熵 H = −Σpᵢlog₂pᵢ，只取决于各类的**比例**分布，与样本总数无关。' +
      '因此 10 个样本 5:5 和 10000 个样本 5000:5000 的熵都是 1。',
    goFurther: '去「理论基础 → 信息论」，拖动样本量滑块，观察熵值不变（比例没变）。',
  },
  {
    id: 't3',
    type: 'single',
    question: '用GINI 系数做决策树分裂时，以下哪种情况下分裂后能获得最大的 GINI 降低？',
    options: [
      { text: '父节点 100 个样本，分成 90/10', correct: false, hint: '10% 的少数没分出来，降低很小' },
      { text: '父节点 100 个样本，分成 50/50', correct: true },
      { text: '父节点 100 个样本，分成 99/1', correct: false },
      { text: '父节点 100 个样本，分成 70/30', correct: false },
    ],
    explanation:
      'GINI = 1 − Σp²。完全均分（50/50）时子节点 GINI 为 0.5，父节点也是 0.5，降低为 0；' +
      '但当父节点本身不纯时，均分能获得最大降低。关键在于**降低的是父节点的不纯度减去子节点的加权不纯度**，' +
      '所以要看父节点有多不纯，而不只是看分得均不均。',
    goFurther: '去「分类实验 → 决策树逐步推演」，把数据换成三团清晰分离的点，看每层分裂的 GINI 降低。',
  },
  {
    id: 't4',
    type: 'judge',
    question: '判断：K-Means 聚类前必须先对数据进行标准化（Z-score），否则结果可能不可靠。',
    options: [
      { text: '正确', correct: true },
      { text: '错误', correct: false, hint: '想想"收入"和"年龄"量纲差 100 倍时会发生什么' },
    ],
    explanation:
      'K-Means 基于欧氏距离计算"最近中心"。若特征量纲差异很大（如年龄 0-100、收入 0-100000），' +
      '距离会被大数值特征主导，年龄那一维几乎不起作用，分类结果失真。' +
      '注意：决策树、随机森林这类基于分裂点的算法**不需要**标准化。',
    goFurther: '去「聚类实验 → K-Means」，把噪声拉大到一定程度，观察质心如何被拉向数据密集处。',
  },
  {
    id: 't5',
    type: 'single',
    question: '偏差-方差权衡中，若训练集表现很好但测试集明显更差，说明什么？',
    options: [
      { text: '欠拟合：模型太简单，能力不足', correct: false, hint: '欠拟合时训练集也会差' },
      { text: '过拟合：模型记住了训练数据的噪声', correct: true },
      { text: '数据有问题，应该重采', correct: false },
      { text: '模型刚好，无需调整', correct: false },
    ],
    explanation:
      '训练好、测试差 = 训练与测试的差距大 = **过拟合**（高方差）。' +
      '常见对策：加正则化、限制树深、增加训练数据、交叉验证选参数。' +
      '反之，两边都差才是欠拟合（高偏差）。',
    goFurther: '去「分类实验 → 决策树逐步推演」，把最大深度拉到 8 以上，看训练/测试准确率是否开始分叉。',
  },
  {
    id: 't6',
    type: 'multiple',
    question: 'ROC 曲线与 AUC 的关系，下列说法正确的有？',
    options: [
      { text: 'AUC = 0.5 表示随机猜测', correct: true },
      { text: 'AUC = 1 表示完美区分', correct: true },
      { text: 'AUC = 0 表示模型反向预测，若取反就变成完美分类', correct: true },
      { text: 'AUC 一定比准确率更可靠，无论什么场景', correct: false,
        hint: 'AUC 只看排序，不看校准；且在极度不平衡时也可能误导' },
    ],
    explanation:
      'AUC 衡量的是「随机取一个正样本和一个负样本，模型给正样本更高分的概率」。' +
      '它与阈值选择无关，因此比单一准确率更能反映排序能力；' +
      '但 AUC 不关心概率值是否"准"（校准），业务上若需要可信概率仍要额外校准。',
    goFurther: '去「分类实验 → 多方法对比工作台」，切换不同方法，观察 ROC 曲线与 AUC 数值如何变化。',
  },
]

// ------------------------------------------------------------
// 2. 数据预处理
// ------------------------------------------------------------
export const prepQuiz: QuizQuestion[] = [
  {
    id: 'p1',
    type: 'single',
    question: '数据集中某列有 60% 的值是缺失的，应该怎么处理？',
    options: [
      { text: '直接删除整列', correct: false, hint: '这一列可能含有重要信息' },
      { text: '用中位数或众数填充', correct: true },
      { text: '用 0 填充', correct: false, hint: '0 往往是有效取值，会引入偏差' },
      { text: '保持缺失，让算法自己处理', correct: false },
    ],
    explanation:
      '缺失率高达 60% 时，删除整列会丢失大量信息。但 0 或均值填充都不妥——' +
      '中位数对偏态分布更稳健，众数适合类别型。' +
      '缺失很少（<5%）时删行反而最省事。',
    goFurther: '去「数据预处理」，把缺失率拉到 60% 以上，对比删列与中位数填充的结果差异。',
  },
  {
    id: 'p2',
    type: 'single',
    question: 'IQR 法则识别异常值的做法是：计算 Q1 和 Q3，令 IQR = Q3 − Q1，则落在哪个区间的值算异常？',
    options: [
      { text: '[Q1, Q3]', correct: false },
      { text: '[Q1 − 1.5×IQR, Q3 + 1.5×IQR] 之外', correct: true },
      { text: '[Q1 − IQR, Q3 + IQR] 之内', correct: false },
      { text: '所有离平均值超过 2 个标准差的值', correct: false, hint: '那是 Z-score 法则' },
    ],
    explanation:
      'IQR 法则把"正常范围"定义为 [Q1−1.5×IQR, Q3+1.5×IQR]，落在范围外即异常。' +
      '1.5 这个系数是经验值，可调；改成 3.0 会更宽松（只抓极端值）。' +
      '相比 Z-score，IQR 不受极端值自身影响（极值会拉高标准差但不影响四分位数）。',
    goFurther: '去「数据预处理」的异常值处理，把阈值 k 从 1.0 拖到 3.0，看被标红的数量变化。',
  },
  {
    id: 'p3',
    type: 'judge',
    question: '判断：对类别型特征做独热编码（one-hot）后，一定可以让它参与 K-Means 聚类的距离计算。',
    options: [
      { text: '正确', correct: false, hint: '独热后的 0/1 数值真的适合算欧氏距离吗？' },
      { text: '错误', correct: true },
    ],
    explanation:
      '独热编码的 0/1 数值看似"标准化"，但每个维度只取 0 或 1，' +
      '欧氏距离会被大量全 0 维度稀释，导致"只有一两个特征不同"的样本也显得很远。' +
      '类别型特征参与 K-Means 的标准做法是**转成距离度量**（如 Gower）或先做聚类再合并，' +
      '而不是直接 one-hot。',
    goFurther: '去「数据预处理 → 类别编码」，试试独热后再送去「聚类实验」看效果是否变差。',
  },
  {
    id: 'p4',
    type: 'single',
    question: 'SMOTE 过采样解决的是什么问题？',
    options: [
      { text: '缺失值太多', correct: false },
      { text: '类别不平衡：少数类样本太少导致模型偏向多数类', correct: true },
      { text: '异常值太多', correct: false },
      { text: '数据量整体太少（与类别无关）', correct: false, hint: 'SMOTE 只解决"少数类"的问题' },
    ],
    explanation:
      'SMOTE 在少数类样本之间**插值**生成合成样本（如 A 与 B 两点的中点），' +
      '而不是简单复制（复制会导致过拟合）。' +
      '注意：应在划分训练/测试集**之后**再做 SMOTE，否则会泄漏测试信息。',
    goFurther: '去「数据预处理」把 SMOTE 打开，再送去「分类实验」，看少数类的召回率是否改善。',
  },
  {
    id: 'p5',
    type: 'multiple',
    question: '关于 Min-Max 标准化与 Z-score 标准化，说法正确的有？',
    options: [
      { text: 'Min-Max 把数据压到 [0, 1]', correct: true },
      { text: 'Z-score 让数据均值为 0、标准差为 1', correct: true },
      { text: '存在极端值时，Z-score 比 Min-Max 更稳健', correct: true },
      { text: '树模型必须先标准化才能训练', correct: false, hint: '树只看"谁比谁大"，缩放不影响分裂点' },
    ],
    explanation:
      'Min-Max 依赖最大值最小值，极端值会压缩其余数据的分布范围；' +
      'Z-score 用均值和标准差，对极端值更稳健。' +
      '但两者对**树模型都不必要**——决策树只比较特征值的大小关系，整体缩放不改变分裂顺序。',
    goFurther: '去「数据预处理 → 标准化」，在直方图上对比两种方式对分布形状的影响。',
  },
]

// ------------------------------------------------------------
// 3. 分类
// ------------------------------------------------------------
export const classifyQuiz: QuizQuestion[] = [
  {
    id: 'c1',
    type: 'multiple',
    question: '下列关于 k-NN 的说法，正确的有哪些？',
    options: [
      { text: '需要先标准化，因为基于欧氏距离', correct: true },
      { text: 'k 值越大预测越平滑，也越不容易过拟合', correct: true },
      { text: '训练阶段很慢，因为它要记住所有样本', correct: false, hint: 'k-NN 的"训练"只是存储，很快' },
      { text: '天然支持多分类', correct: true },
    ],
    explanation:
      'k-NN 属于**惰性学习**：训练只做存储，预测时才真正计算距离。' +
      '所以它训练快、预测慢，且必须标准化（基于距离）。' +
      'k 越小越容易过拟合（可能只跟一两个邻居走），k 越大越平滑（可能欠拟合）。',
    goFurther: '去「分类实验 → k-NN 逐步推演」，把 k 从 1 拖到 15，看决策边界如何从锯齿变平滑。',
  },
  {
    id: 'c2',
    type: 'single',
    question: '逻辑回归输出 0.7，通常表示什么？',
    options: [
      { text: '预测为第 0 类的概率是 0.7', correct: false, hint: '顺序反了' },
      { text: '预测为第 1 类的概率是 0.7', correct: true },
      { text: '模型有 70% 的准确率', correct: false, hint: '混淆了预测概率与准确率' },
      { text: '特征的权重是 0.7', correct: false },
    ],
    explanation:
      '逻辑回归经Sigmoid(z) 输出 [0,1] 的**正类概率**。0.7 表示"属于第 1 类的概率约 70%"，' +
      '但这**不是准确率**——准确率要等所有样本都预测完、跟真实标签比对后才能算出来。',
    goFurther: '去「分类实验 → 逻辑回归逐步推演」，看每一步如何把线性输出压进 [0,1]。',
  },
  {
    id: 'c3',
    type: 'judge',
    question: '判断：SVM 中margin 越大，模型越不容易过拟合。',
    options: [
      { text: '正确', correct: true },
      { text: '错误', correct: false, hint: '想想 C 参数与margin 的关系' },
    ],
    explanation:
      'SVM 的目标是找到"间隔最宽"的分隔带。margin 越大说明选中的支持向量越"远离"决策边界，' +
      '对噪声更鲁棒，因此更不容易过拟合。' +
      'C 参数控制对"分类错误的惩罚"：C 越大越不容忍错误 → 更容易过拟合（margin 变小）。',
    goFurther: '去「分类实验 → SVM 逐步推演」，调 C 参数观察支持向量数量与 margin 的变化。',
  },
  {
    id: 'c4',
    type: 'single',
    question: '随机森林为什么比单棵决策树更不容易过拟合？',
    options: [
      { text: '因为它用了更多的特征', correct: false, hint: '这不是关键' },
      { text: '因为它对每棵树用不同的随机样本子集训练，最终投票，抵消了单棵树的过拟合', correct: true },
      { text: '因为它的树更浅', correct: false, hint: '通常反而更深' },
      { text: '因为它不需要划分训练测试集', correct: false },
    ],
    explanation:
      '随机森林有两个随机源：**Bootstrap 抽样**（每棵树看不同的数据子集）+ ' +
      '**特征随机采样**（每个节点分裂时随机看一部分特征）。' +
      '单棵树的偏差会因数据/特征不同而互相抵消，最终结果方差大幅降低。',
    goFurther: '去「分类实验 → 随机森林逐步推演」，看每棵树用的是哪些样本（带内/带外）。',
  },
  {
    id: 'c5',
    type: 'multiple',
    question: '关于过拟合，下列哪些做法是有效的应对手段？',
    options: [
      { text: '限制决策树的最大深度', correct: true },
      { text: '增加训练数据量', correct: true },
      { text: '添加正则化项（如 L1/L2）', correct: true },
      { text: '把测试集也拿来训练以提高准确率', correct: false, hint: '这样得到的准确率是虚假的' },
    ],
    explanation:
      '过拟合的本质是模型"记住了训练数据的噪声"。' +
      '应对要么**限制模型容量**（限深、加正则），要么**增加有效数据**。' +
      '把测试集混入训练会让评估失去意义——它不再是"未见过的数据"。',
    goFurther: '去「分类实验 → 多方法对比工作台」，调测试集比例，看小测试集时准确率如何虚高。',
  },
]

// ------------------------------------------------------------
// 4. 聚类
// ------------------------------------------------------------
export const clusterQuiz: QuizQuestion[] = [
  {
    id: 'k1',
    type: 'single',
    question: 'K-Means 算法一定能找到全局最优的聚类结果吗？',
    options: [
      { text: '是，K-Means 是全局最优算法', correct: false },
      { text: '不一定，它收敛到的是局部最优，取决于初始质心位置', correct: true },
      { text: '只有数据是球形分布时才最优', correct: false, hint: '这不是"是否最优"的原因' },
      { text: '只要 k 取对就一定全局最优', correct: false },
    ],
    explanation:
      'K-Means 用的是**梯度下降式的迭代优化**（Lloyd 算法），只能保证收敛到局部最优。' +
      '不同的初始质心可能收敛到不同结果，所以实际使用要多次随机初始化（k-means++）取最优。',
    goFurther: '去「聚类实验 → K-Means」，手动把初始质心放在不同位置，观察收敛结果的差异。',
  },
  {
    id: 'k2',
    type: 'single',
    question: 'DBSCAN 相比 K-Means 的最大优势是什么？',
    options: [
      { text: '计算更快', correct: false, hint: 'DBSCAN 通常更慢' },
      { text: '能识别噪声点，且不需要预先指定簇的数量', correct: true },
      { text: '一定能找到任意形状的簇', correct: false, hint: 'eps 参数选不好就会失败' },
      { text: '不需要标准化', correct: false, hint: '它同样基于距离' },
    ],
    explanation:
      'DBSCAN 基于"密度"聚类：只要一个点的邻域内有足够多的邻居，它就属于某个簇的核心点。' +
      '因此它**自动确定簇数**，并把低密度区域的点标记为噪声（-1）。' +
      '但 EPS 参数不合适时会失败——它找到的簇形状受距离度量限制。',
    goFurther: '去「聚类实验 → DBSCAN」，把 eps 逐步调大，看噪声点被逐步并入簇的过程。',
  },
  {
    id: 'k3',
    type: 'single',
    question: '轮廓系数（Silhouette）接近 0 说明什么？',
    options: [
      { text: '聚类效果非常好', correct: false, hint: '接近 1 才是非常好' },
      { text: '簇内很紧凑，但与邻近簇几乎重叠，分界不清', correct: true },
      { text: '样本量太小，无法评估', correct: false },
      { text: '一定存在噪声点', correct: false },
    ],
    explanation:
      '轮廓系数 = (b − a) / max(a, b)，其中 a 是样本到**同簇**的平均距离（越小越好），' +
      'b 是到**最近邻簇**的平均距离（越大越好）。取值范围 [−1, 1]。' +
      '接近 0 说明 a ≈ b：样本在自己的簇里待着和去邻居簇差不多远，说明分界模糊。',
    goFurther: '去「聚类实验 → 多方法对比工作台」，对比 K-Means 与 DBSCAN 的轮廓系数差异。',
  },
  {
    id: 'k4',
    type: 'judge',
    question: '判断：在 K-Means 中把 k 设得越大，簇内平方和（SSE）就一定越小。',
    options: [
      { text: '正确', correct: true },
      { text: '错误', correct: false, hint: '想想手肘法曲线会不会一直下降' },
    ],
    explanation:
      'k 越大簇越多、每个簇越小，SSE 单调递减——但这是"必然更小"，**不代表更好**。' +
      '所以要用手肘法（画 SSE-k 曲线找拐点）或轮廓系数来选 k，而不是"越小越好"。',
    goFurther: '去「聚类实验 → K-Means」，把 k 从 1 拖到 10，观察 SSE 曲线的拐点位置。',
  },
  {
    id: 'k5',
    type: 'multiple',
    question: '层次聚类（ agglomerative）与 K-Means 的区别，正确的有？',
    options: [
      { text: '层次聚类产生一棵树（树状图），可以切任意层得到不同数量的簇', correct: true },
      { text: '层次聚类不需要预先指定 k', correct: true },
      { text: '层次聚类的复杂度随数据量平方增长，大数据上不适用', correct: true },
      { text: '层次聚类必须先标准化', correct: false, hint: '它也基于距离，但这是 K-Means 的问题' },
    ],
    explanation:
      '层次聚类自底向上逐步合并簇，产出树状图——这是它最大的特色：' +
      '一棵数据只需聚类一次，切在不同高度就能得到不同 k。' +
      '代价是每步要维护簇间距离矩阵，时间与空间复杂度都是 O(n²)。',
    goFurther: '去「聚类实验 → 层次聚类」，拖动切分高度，观察簇数从多到少的变化。',
  },
]

// ------------------------------------------------------------
// 5. 关联分析
// ------------------------------------------------------------
export const assocQuiz: QuizQuestion[] = [
  {
    id: 'a1',
    type: 'single',
    question: '「啤酒→尿布」这条规则的支持度很高，但提升度（lift）接近 1。这说明什么？',
    options: [
      { text: '关联很强，应该大力推荐', correct: false },
      { text: '两者只是碰巧同时热门，没有真正的相关性', correct: true },
      { text: '规则有误，应该删除', correct: false },
      { text: '支持度需要重新计算', correct: false },
    ],
    explanation:
      'lift = conf(A→B) / sup(B)。lift ≈ 1 表示「买 A 之后买 B 的概率」和「随便一个人买 B 的概率」差不多，' +
      '也就是两者各自热门但彼此无关。' +
      '这是关联规则最常见的误读：**高支持度 ≠ 有价值**，必须看 lift。',
    goFurther: '去「关联分析 → 算法原理」看 lift 的解读，或到规则表里找 lift≈1 的行。',
  },
  {
    id: 'a2',
    type: 'single',
    question: 'Apriori 的剪枝依据是什么？',
    options: [
      { text: '频繁项集的所有超集必然频繁', correct: false, hint: '方向反了' },
      { text: '非频繁项集的所有超集必然非频繁', correct: true },
      { text: '支持度高的项集必然组合起来也高', correct: false },
      { text: '候选集数量必须小于某个固定值', correct: false },
    ],
    explanation:
      '这就是**反单调性**：若{牛奶,面包} 不频繁，则 {牛奶,面包,X} 只会包含更少的交易，' +
      '必然也不频繁。所以一旦某个候选不达标，它的整棵"超集子树"都可以跳过。' +
      'FP-Growth 用的是同一条性质，只是在树上做。',
    goFurther: '去「关联分析 → 逐步演示」，看被剪掉的候选如何连带跳过大量后继组合。',
  },
  {
    id: 'a3',
    type: 'judge',
    question: '判断：FP-Growth 与 Apriori 挖出的频繁项集可能不同。',
    options: [
      { text: '正确', correct: false, hint: '回想「算法原理」页里那张「两者是什么关系」的卡' },
      { text: '错误，两者结果必然完全相同', correct: true },
    ],
    explanation:
      '两个算法的**目标相同、剪枝依据也相同**，所以结果必然一致——差异只在执行方式。' +
      '平台在「性能对比」页第一行就实时校验这一点，若不一致会标红告警。',
    goFurther: '去「关联分析 → 性能对比」，看首行的一致性校验卡片。',
  },
  {
    id: 'a4',
    type: 'single',
    question: 'FP-Growth 相对Apriori 的核心优势是？',
    options: [
      { text: '能找到Apriori 找不到的频繁项集', correct: false, hint: '两者结果相同' },
      { text: '只扫一遍数据库，之后在压缩后的 FP-tree 上挖掘，避免候选集爆炸', correct: true },
      { text: '不需要剪枝', correct: false },
      { text: '不需要计算支持度', correct: false },
    ],
    explanation:
      'Apriori 每挖一层就要重扫全库，且候选集按组合数增长（C(n,1)+C(n,2)+…）容易爆炸。' +
      'FP-Growth 把数据库压缩成 FP-tree（相同前缀的交易合并计数），之后只在树上递归，' +
      '只枚举那些**已证明频繁**的项集。',
    goFurther: '去「关联分析 → 性能对比」，把交易笔数调到 2000、支持度调到 5%，看候选量差距。',
  },
  {
    id: 'a5',
    type: 'multiple',
    question: '关于支持度阈值（minSupport）的设置，下列说法正确的有？',
    options: [
      { text: '阈值设得越高，挖出的频繁项集越少', correct: true },
      { text: '阈值设得越高，候选集规模也越小（Apriori 尤其明显）', correct: true },
      { text: '阈值应该越高越好，这样挖出的关联更有意义', correct: false, hint: '太严格会漏掉有价值的中等强度关联' },
      { text: '阈值需结合业务场景和数据规模确定', correct: true },
    ],
    explanation:
      '阈值提高会让频繁项集变少、候选集也变小，但**不是越高越好**。' +
      '设得太高会漏掉真实存在的中等强度关联；且数据量不同，同一阈值含义也不同' +
      '（10万笔交易里的 5% 和 100 笔里的 5% 完全是两回事）。',
    goFurther: '去「关联分析 → 逐步演示」，把支持度从 20% 慢慢拖到 2%，观察每一层的变化。',
  },
]