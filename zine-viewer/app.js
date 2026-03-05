// ============================================================
//  ZINE Viewer — app.js
//  Three.js + GSAP
//  折本(8ページ)の3D折りたたみ + 見開きページめくり
// ============================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ZINE_DATA } from './config.js';

// ─── 定数 ─────────────────────────────────
const SPREAD_W = 4.0;       // 3D空間上のA4展開図幅
const SPREAD_H = SPREAD_W * (210 / 297); // A4横長の高さ
const HALF_W   = SPREAD_W / 2;
const HALF_H   = SPREAD_H / 2;
const QTR_W    = SPREAD_W / 4;  // 1ページ幅
const QTR_H    = SPREAD_H / 2;  // 1ページ高さ

// 見開きステート (0..4)
const SPREAD_LABELS = ['表紙', '2 — 3', '4 — 5', '6 — 7', '裏表紙'];
const SPREAD_COUNT  = 5;

// ─── State ─────────────────────────────────
const state = {
    view: 'gallery',
    phase: 'flat',    // flat | folding | book
    zine: null,
    spread: 0,
};

// ─── DOM refs ──────────────────────────────
const $ = id => document.getElementById(id);
const loadingScreen = $('loading-screen');
const galleryView   = $('gallery-view');
const galleryGrid   = $('gallery-grid');
const canvasWrap    = $('canvas-wrap');
const viewerUI      = $('viewer-ui');
const foldPrompt    = $('fold-prompt');
const pageUI        = $('page-ui');
const btnFold       = $('btn-fold');
const btnPrev       = $('btn-prev');
const btnNext       = $('btn-next');
const btnGallery    = $('btn-gallery');
const btnPdf        = $('btn-pdf');
const pageLabel     = $('page-label');

// ─── Three.js Scene ────────────────────────
const scene    = new THREE.Scene();
scene.background = new THREE.Color(0xfafaf8);

const camera   = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 0, 7);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
canvasWrap.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan     = false;
controls.enableZoom    = true;
controls.minDistance    = 2.5;
controls.maxDistance    = 12;
controls.enabled       = false;

// Lights
scene.add(new THREE.AmbientLight(0xffffff, 0.65));
const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(3, 6, 5);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(1024, 1024);
dirLight.shadow.camera.near = 0.1;
dirLight.shadow.camera.far  = 20;
dirLight.shadow.camera.left = -5;
dirLight.shadow.camera.right = 5;
dirLight.shadow.camera.top   = 5;
dirLight.shadow.camera.bottom = -5;
scene.add(dirLight);

// Floor
const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 20),
    new THREE.ShadowMaterial({ opacity: 0.08 })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -HALF_H - 0.5;
floor.receiveShadow = true;
scene.add(floor);

// ─── Texture Loader ────────────────────────
const texLoader = new THREE.TextureLoader();

function loadTex(url) {
    // キャッシュ対策: `assets`配下の画像なら現在のタイムスタンプを付与
    // 同じファイル名で上書きしてもブラウザが古い画像を出し続けるのを防ぐ
    const timestampUrl = (url && url.includes('assets')) ? url + '?v=' + Date.now() : url;
    return new Promise((res, rej) => {
        texLoader.load(timestampUrl, t => {
            t.colorSpace = THREE.SRGBColorSpace;
            t.minFilter = THREE.LinearFilter;
            t.magFilter = THREE.LinearFilter;
            res(t);
        }, undefined, rej);
    });
}

// ============================================================
//  展開図レイアウト
//  展開図 (広げた状態, 印刷面を上にして見た場合):
//    上段(逆さ): [6] [7] | [8] [1]     col 0,1,2,3  row 0
//    下段(正位): [5] [4] | [3] [2]     col 0,1,2,3  row 1
//  中央の | は切り込み位置 (col 1-2 の境界)
//
//  pageIndex 0..7 (=page 1..8) → grid position
// ============================================================
const PAGE_GRID = [
    { col: 3, row: 0 },  // page 1 (表紙)
    { col: 3, row: 1 },  // page 2
    { col: 2, row: 1 },  // page 3
    { col: 1, row: 1 },  // page 4
    { col: 0, row: 1 },  // page 5
    { col: 0, row: 0 },  // page 6
    { col: 1, row: 0 },  // page 7
    { col: 2, row: 0 },  // page 8 (裏表紙)
];


// ============================================================
//  折りたたみリグ
//
//  キンコーズの手順書に基づく折り方:
//  1. 上下半分に折る
//  2. さらに半分 (4等分) に折る
//  3. さらに半分 (8等分) に折って折り目をつける
//  4. 4等分の状態に戻し、中央 (col 1-2 境界) に切り込み
//  5. すべて開いて、①②と⑤⑥が山になるよう中心に寄せる
//  6. 天が山になるよう折る
//  7. ①が表紙になるよう折りたたんで完成
//
//  3Dアニメーションでは以下の3ステップに凝縮:
//  Step A: フラット展開図を表示
//  Step B: 上段を下へ折る (手順1の上下折り)
//  Step C: 切り込みを示し、中心に寄せてアコーディオン折り
//         → 本の形に遷移
// ============================================================
let rigRoot   = null;
let topPanels = [];   // row 0 のパネル
let botPanels = [];   // row 1 のパネル

function disposePrevRig() {
    if (rigRoot) {
        rigRoot.traverse(child => {
            if (child.isMesh) {
                child.geometry.dispose();
                if (child.material.map) child.material.map.dispose();
                child.material.dispose();
            }
        });
        scene.remove(rigRoot);
    }
    rigRoot = null;
    topPanels = [];
    botPanels = [];
}

function buildFoldingRig(spreadTex) {
    disposePrevRig();

    rigRoot = new THREE.Group();
    scene.add(rigRoot);

    // --- 上段ヒンジ (y=0を軸に回転) ---
    const topHinge = new THREE.Group();
    topHinge.position.set(0, 0, 0);
    rigRoot.add(topHinge);
    rigRoot.userData.topHinge = topHinge;

    for (let pageIdx = 0; pageIdx < 8; pageIdx++) {
        const grid = PAGE_GRID[pageIdx];
        const col  = grid.col;
        const isTop = grid.row === 0;

        const panelGroup = new THREE.Group();

        // 印刷面 (Front)
        const frontGeo = new THREE.PlaneGeometry(QTR_W, QTR_H);
        const tex = spreadTex.clone();
        tex.needsUpdate = true;
        tex.repeat.set(1/4, 1/2);
        tex.offset.set(col / 4, isTop ? 0.5 : 0.0);
        
        const frontMat = new THREE.MeshStandardMaterial({
            map: tex,
            roughness: 0.85,
            metalness: 0.0,
            transparent: true,
            color: 0xffffff
        });
        const frontMesh = new THREE.Mesh(frontGeo, frontMat);
        frontMesh.position.z = 0.002;
        frontMesh.castShadow = true;

        // 白背景・裏面 (Back / Alpha BG)
        const backGeo = new THREE.PlaneGeometry(QTR_W, QTR_H);
        const backMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.85,
            metalness: 0.0,
            side: THREE.DoubleSide
        });
        const backMesh = new THREE.Mesh(backGeo, backMat);
        backMesh.position.z = 0;
        backMesh.castShadow = true;

        panelGroup.add(frontMesh);
        panelGroup.add(backMesh);

        // A4グリッド上の位置
        const xPos = (-1.5 + col) * QTR_W;
        const yPos = isTop ? QTR_H / 2 : -QTR_H / 2;
        panelGroup.position.set(xPos, yPos, pageIdx * 0.001);

        // 上段は逆さ印刷のまま表示するため（逆さに配置されているのが正しい状態）
        // mesh.rotation.z = Math.PI は行わない

        if (isTop) {
            topHinge.add(panelGroup);
            topPanels.push(panelGroup);
        } else {
            rigRoot.add(panelGroup);
            botPanels.push(panelGroup);
        }
    }
}


// ============================================================
//  折りたたみアニメーション
// ============================================================
// ============================================================
//  折りたたみアニメーション（修正版）
// ============================================================
function playFoldAnimation() {
    return new Promise(resolve => {
        state.phase = 'folding';
        const topHinge = rigRoot.userData.topHinge;
        const pw = QTR_W;
        const ph = QTR_H;
        const centerY = -0.5 * ph;

        // --- アニメーション用の中間リグ（骨組み）を先に作っておく ---
        // これを作っておくことで、アニメーション中に紙の継ぎ目が外れなくなる
        const rig = {
            leftBlock: new THREE.Group(),
            rightBlock: new THREE.Group(),
            frontLeft: new THREE.Group(),
            backLeft: new THREE.Group(),
            frontRight: new THREE.Group(),
            backRight: new THREE.Group()
        };
        // 初期位置を左右の端にセット
        rig.leftBlock.position.set(-pw, centerY, 0);
        rig.rightBlock.position.set(pw, centerY, 0);
        rig.leftBlock.add(rig.frontLeft, rig.backLeft);
        rig.rightBlock.add(rig.frontRight, rig.backRight);
        rigRoot.add(rig.leftBlock, rig.rightBlock);

        const tl = gsap.timeline({
            defaults: { ease: 'power2.inOut' },
            onComplete: resolve,
        });

        // --- カメラを斜め上へ移動 ---
        tl.to(camera.position, { x: 0.5, y: 3, z: 6, duration: 1.5 }, 0);
        tl.to(controls.target, {
            x: 0, y: 0, z: 0, duration: 1.5,
            onUpdate: () => controls.update(),
        }, 0);

       // Step 1: 上段を裏へ折る (写真②の状態)
        // 印刷面を外側にするため、奥側 (-Math.PI) へ山折りする
        tl.to(topHinge.rotation, { x: -Math.PI, duration: 1.5 }, 0.5);

        // Step 1.5: 実際のパネルを中間リグに付け替える（表示の切り替わり時点）
        tl.call(() => {
            // Left arm (P5, P6)
            botPanels[0].position.set(-pw/2, 0, 0.001); botPanels[0].rotation.set(0, 0, 0);
            rig.leftBlock.add(botPanels[0]);
            topPanels[0].position.set(-pw/2, 0, -0.001); topPanels[0].rotation.set(-Math.PI, 0, 0);
            rig.leftBlock.add(topPanels[0]);

            // Front Left (P4)
            botPanels[1].position.set(pw/2, 0, 0.002); botPanels[1].rotation.set(0, 0, 0);
            rig.frontLeft.add(botPanels[1]);

            // Back Left (P7)
            topPanels[1].position.set(pw/2, 0, -0.002); topPanels[1].rotation.set(-Math.PI, 0, 0);
            rig.backLeft.add(topPanels[1]);

            // Right arm (P2, P1)
            botPanels[3].position.set(pw/2, 0, 0.001); botPanels[3].rotation.set(0, 0, 0);
            rig.rightBlock.add(botPanels[3]);
            topPanels[3].position.set(pw/2, 0, -0.001); topPanels[3].rotation.set(-Math.PI, 0, 0);
            rig.rightBlock.add(topPanels[3]);

            // Back Right (P8)
            topPanels[2].position.set(-pw/2, 0, -0.002); topPanels[2].rotation.set(-Math.PI, 0, 0);
            rig.backRight.add(topPanels[2]);
        }, null, 2.0);

        // Step 2: 十字折り (Cross fold) - 写真③の状態
        const crossStart = 2.2;
        const crossDur = 1.5;

        // 左右のブロックを中央に寄せる
        tl.to(rig.leftBlock.position, { x: 0, duration: crossDur }, crossStart);
        tl.to(rig.rightBlock.position, { x: 0, duration: crossDur }, crossStart);
        
        // 切り込み部分をパカッと開く
        tl.to(rig.frontLeft.rotation, { y: -Math.PI/2, duration: crossDur }, crossStart);
        tl.to(rig.backLeft.rotation, { y: Math.PI/2, duration: crossDur }, crossStart);
        tl.to(rig.frontRight.rotation, { y: Math.PI/2, duration: crossDur }, crossStart);
        tl.to(rig.backRight.rotation, { y: -Math.PI/2, duration: crossDur }, crossStart);

        tl.to(camera.position, { x: 0, y: 4, z: 5, duration: crossDur }, crossStart);

        // Step 3: 十字から本へ (Book collapse) - 写真④の状態
        const bookStart = crossStart + crossDur + 0.5;
        const bookDur = 1.5;

        // 全てのアームを左側にパタンと閉じる
        tl.to(rig.rightBlock.rotation, { y: -Math.PI, duration: bookDur }, bookStart);
        tl.to(rig.frontLeft.rotation, { y: -Math.PI, duration: bookDur }, bookStart);
        tl.to(rig.backLeft.rotation, { y: -Math.PI, duration: bookDur }, bookStart);

        // 右ブロック内の子パネルは相対的に0度に戻せば同じ方向（左）を向く
        tl.to(rig.frontRight.rotation, { y: 0, duration: bookDur }, bookStart);
        tl.to(rig.backRight.rotation, { y: 0, duration: bookDur }, bookStart);

        // Z-fighting（重なって画面がチラチラする現象）防止のため、コンマミリ単位で紙を重ねる
        tl.to(rig.rightBlock.position, { z: 0.04, duration: bookDur }, bookStart);   // 表紙・裏表紙の裏
        tl.to(rig.frontRight.position, { z: 0.03, duration: bookDur }, bookStart);
        tl.to(rig.frontLeft.position, { z: 0.02, duration: bookDur }, bookStart);
        tl.to(rig.leftBlock.position, { z: 0.01, duration: bookDur }, bookStart);
        tl.to(rig.backLeft.position, { z: 0.00, duration: bookDur }, bookStart);
        tl.to(rig.backRight.position, { z: -0.01, duration: bookDur }, bookStart); // 一番奥

        // 最後にカメラと全体をビューワー位置へ
        tl.to(rigRoot.rotation, { x: -0.15, y: 0.1, duration: bookDur }, bookStart);
        tl.to(camera.position, { x: 0, y: 0.5, z: 4, duration: bookDur }, bookStart);
    });
}
let bookGroup = null;
let pageTextures = [];
let leftPageGroup = null;
let rightPageGroup = null;
let leftPageMesh = null; // Front texture mesh
let rightPageMesh = null;// Front texture mesh
let leftBackMesh = null; // White background mesh
let rightBackMesh = null; // White background mesh
let spineMesh     = null;
let isFlipping = false;

function disposeBook() {
    if (bookGroup) {
        bookGroup.traverse(child => {
            if (child.isMesh) {
                child.geometry.dispose();
                if (child.material.map) child.material.map.dispose();
                child.material.dispose();
            }
        });
        scene.remove(bookGroup);
    }
    bookGroup = null;
    leftPageGroup = null;
    rightPageGroup = null;
    leftPageMesh = null;
    rightPageMesh = null;
    leftBackMesh = null;
    rightBackMesh = null;
    spineMesh = null;
    pageTextures = [];
    isFlipping = false;
}

async function loadPageTextures(zine) {
    const textures = [];
    if (zine.pages) {
        for (let i = 0; i < 8; i++) {
            const path = zine.pages[i];
            if (path) {
                try { textures.push(await loadTex(path)); }
                catch { textures.push(null); }
            } else {
                textures.push(null);
            }
        }
    } else {
        const spreadTex = await loadTex(zine.spread);
        for (let i = 0; i < 8; i++) {
            const grid = PAGE_GRID[i];
            const t = spreadTex.clone();
            t.needsUpdate = true;
            if (grid.row === 0) {
                // 上段: 逆さ → 反転して正位置にする
                t.repeat.set(-1/4, -1/2);
                t.offset.set((grid.col + 1) / 4, 1.0);
            } else {
                t.repeat.set(1/4, 1/2);
                t.offset.set(grid.col / 4, 0.0);
            }
            textures.push(t);
        }
    }
    return textures;
}

// ─── スプレッド定義 (ページインデックス 0..7) ───
// spread 0: 表紙  → left: null, right: page 0 (表紙)
// spread 1: 2-3   → left: page 1, right: page 2
// spread 2: 4-5   → left: page 3, right: page 4
// spread 3: 6-7   → left: page 5, right: page 6
// spread 4: 裏表紙 → left: page 7 (裏表紙), right: null
const SPREAD_DEFS = [
    { left: null, right: 0 },
    { left: 1, right: 2 },
    { left: 3, right: 4 },
    { left: 5, right: 6 },
    { left: 7, right: null },
];

function buildBookView(textures) {
    disposeBook();
    pageTextures = textures;

    bookGroup = new THREE.Group();
    scene.add(bookGroup);

    const pw = QTR_W * 1.6;
    const ph = QTR_H * 1.6;

    // 左ページグループ
    leftPageGroup = new THREE.Group();
    leftPageGroup.position.set(-pw / 2 - 0.02, 0, 0);
    bookGroup.add(leftPageGroup);

    const lGeo = new THREE.PlaneGeometry(pw, ph);
    const lMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.85,
        transparent: true
    });
    leftPageMesh = new THREE.Mesh(lGeo, lMat);
    leftPageMesh.position.z = 0.002;
    leftPageMesh.castShadow = true;
    
    const lBackMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.85,
        side: THREE.DoubleSide
    });
    leftBackMesh = new THREE.Mesh(lGeo, lBackMat);
    leftBackMesh.position.z = 0;
    leftBackMesh.castShadow = true;
    leftPageGroup.add(leftPageMesh);
    leftPageGroup.add(leftBackMesh);

    // 右ページグループ
    rightPageGroup = new THREE.Group();
    rightPageGroup.position.set(pw / 2 + 0.02, 0, 0);
    bookGroup.add(rightPageGroup);

    const rGeo = new THREE.PlaneGeometry(pw, ph);
    const rMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.85,
        transparent: true
    });
    rightPageMesh = new THREE.Mesh(rGeo, rMat);
    rightPageMesh.position.z = 0.002;
    rightPageMesh.castShadow = true;

    const rBackMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.85,
        side: THREE.DoubleSide
    });
    rightBackMesh = new THREE.Mesh(rGeo, rBackMat);
    rightBackMesh.position.z = 0;
    rightBackMesh.castShadow = true;
    rightPageGroup.add(rightPageMesh);
    rightPageGroup.add(rightBackMesh);

    // 中央の綴じ線 (spine)
    const spGeo = new THREE.BoxGeometry(0.04, ph, 0.06);
    const spMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.9 });
    spineMesh = new THREE.Mesh(spGeo, spMat);
    spineMesh.castShadow = true;
    bookGroup.add(spineMesh);

    // 初期表示: 表紙 (spread 0)
    applySpreadTextures(0);

    // 軽く傾ける
    bookGroup.rotation.set(-0.12, 0.08, 0);

    // カメラセット
    gsap.to(camera.position, { x: 0, y: 0.5, z: 4.5, duration: 1.2, ease: 'power2.out' });
    gsap.to(controls.target, { x: 0, y: 0, z: 0, duration: 1.2, ease: 'power2.out',
        onUpdate: () => controls.update() });
}

function applySpreadTextures(spreadIdx) {
    const def = SPREAD_DEFS[spreadIdx];

    // 左ページ
    if (def.left !== null) {
        leftPageMesh.material.map = pageTextures[def.left] || null;
        leftPageGroup.visible = true;
    } else {
        leftPageGroup.visible = false;
    }
    leftPageMesh.material.needsUpdate = true;

    // 右ページ
    if (def.right !== null) {
        rightPageMesh.material.map = pageTextures[def.right] || null;
        rightPageGroup.visible = true;
    } else {
        rightPageGroup.visible = false;
    }
    rightPageMesh.material.needsUpdate = true;
}


// ============================================================
//  ページめくりアニメーション
//  中心線 (spine) を軸に右ページが左に送られる動き
//  → 右ページを spine 位置をピボットに Y軸 -180° 回転
// ============================================================
function flipPage(newSpread, direction) {
    if (isFlipping || !bookGroup) return;
    isFlipping = true;

    const pw = QTR_W * 1.6;

    // direction > 0: 次へ (右ページを左へめくる)
    // direction < 0: 前へ (左ページを右へめくる)

    if (direction > 0) {
        // === 次のページへ ===
        // 右ページをめくる動き

        // めくり用のピボットグループを作成 (中心線位置)
        const flipPivot = new THREE.Group();
        flipPivot.position.set(0, 0, 0.005); // spine の位置 (少し手前)
        bookGroup.add(flipPivot);

        // 右ページをピボットに移す (ローカル座標を調整)
        bookGroup.remove(rightPageGroup);
        rightPageGroup.position.set(pw / 2 + 0.02, 0, 0); // pivot ローカルでの位置
        flipPivot.add(rightPageGroup);

        const tl = gsap.timeline({
            onComplete: () => {
                // ピボットから戻す
                flipPivot.remove(rightPageGroup);
                bookGroup.add(rightPageGroup);
                rightPageGroup.position.set(pw / 2 + 0.02, 0, 0);
                rightPageGroup.rotation.set(0, 0, 0);
                bookGroup.remove(flipPivot);

                // 新しいテクスチャを適用
                state.spread = newSpread;
                applySpreadTextures(newSpread);
                isFlipping = false;
            },
        });

        // ページをめくる: Y軸で -180° (右→左へ)
        tl.to(flipPivot.rotation, {
            y: -Math.PI,
            duration: 0.6,
            ease: 'power2.inOut',
        });

    } else {
        // === 前のページへ ===
        // 左ページを右へめくる

        const flipPivot = new THREE.Group();
        flipPivot.position.set(0, 0, 0.005);
        bookGroup.add(flipPivot);

        bookGroup.remove(leftPageGroup);
        leftPageGroup.position.set(-(pw / 2 + 0.02), 0, 0);
        flipPivot.add(leftPageGroup);

        const tl = gsap.timeline({
            onComplete: () => {
                flipPivot.remove(leftPageGroup);
                bookGroup.add(leftPageGroup);
                leftPageGroup.position.set(-(pw / 2 + 0.02), 0, 0);
                leftPageGroup.rotation.set(0, 0, 0);
                bookGroup.remove(flipPivot);

                state.spread = newSpread;
                applySpreadTextures(newSpread);
                isFlipping = false;
            },
        });

        tl.to(flipPivot.rotation, {
            y: Math.PI,
            duration: 0.6,
            ease: 'power2.inOut',
        });
    }
}


// ============================================================
//  UI Logic
// ============================================================
function showGallery() {
    state.view = 'gallery';
    state.phase = 'flat';
    state.zine = null;
    state.spread = 0;

    disposePrevRig();
    disposeBook();

    galleryView.classList.remove('hidden');
    viewerUI.classList.add('hidden');
    foldPrompt.classList.add('hidden');
    pageUI.classList.add('hidden');
    controls.enabled = false;
}

async function openZine(zine) {
    state.view = 'viewer';
    state.phase = 'flat';
    state.zine = zine;
    state.spread = 0;

    loadingScreen.classList.remove('fade-out');
    loadingScreen.style.display = 'flex';

    try {
        const spreadTex = await loadTex(zine.spread);
        buildFoldingRig(spreadTex);

        camera.position.set(0, 0, 7);
        controls.target.set(0, 0, 0);
        controls.update();

        galleryView.classList.add('hidden');
        viewerUI.classList.remove('hidden');
        foldPrompt.classList.remove('hidden');
        pageUI.classList.add('hidden');
        controls.enabled = true;

    } catch (err) {
        console.error('Failed to load ZINE:', err);
        alert('画像の読み込みに失敗しました。');
        showGallery();
    }

    loadingScreen.classList.add('fade-out');
    setTimeout(() => { loadingScreen.style.display = 'none'; }, 600);
}

async function startFolding() {
    foldPrompt.classList.add('hidden');
    await playFoldAnimation();

    state.phase = 'book';
    disposePrevRig();

    const textures = await loadPageTextures(state.zine);
    buildBookView(textures);

    pageUI.classList.remove('hidden');
    updateSpreadLabel();
}

function updateSpreadLabel() {
    pageLabel.textContent = SPREAD_LABELS[state.spread];
    btnPrev.disabled = state.spread === 0;
    btnNext.disabled = state.spread === SPREAD_COUNT - 1;

    if (state.spread === SPREAD_COUNT - 1 && state.zine?.pdf) {
        btnPdf.href = state.zine.pdf;
        btnPdf.classList.remove('hidden');
        gsap.fromTo(btnPdf, { opacity: 0, y: 15 }, { opacity: 1, y: 0, duration: 0.7, ease: 'power2.out' });
    } else {
        btnPdf.classList.add('hidden');
    }
}

function goSpread(delta) {
    const oldSpread = state.spread;
    const newSpread = Math.max(0, Math.min(SPREAD_COUNT - 1, oldSpread + delta));
    if (newSpread === oldSpread) return;
    flipPage(newSpread, delta);
    updateSpreadLabel();
}


// ─── Event Bindings ────────────────────────
btnFold.addEventListener('click', startFolding);
btnGallery.addEventListener('click', showGallery);
btnPrev.addEventListener('click', () => goSpread(-1));
btnNext.addEventListener('click', () => goSpread(1));

window.addEventListener('keydown', e => {
    if (state.view !== 'viewer' || state.phase !== 'book') return;
    if (e.key === 'ArrowRight' || e.key === 'd') goSpread(1);
    if (e.key === 'ArrowLeft'  || e.key === 'a') goSpread(-1);
    if (e.key === 'Escape') showGallery();
});


// ─── Gallery Init ──────────────────────────
function initGallery() {
    ZINE_DATA.forEach(zine => {
        const card = document.createElement('div');
        card.className = 'zine-card';
        card.innerHTML = `
            <div class="zine-thumb">
                <img src="${zine.cover}" alt="${zine.label}" 
                     onerror="this.style.display='none'"
                     loading="lazy">
            </div>
            <p class="zine-label">${zine.label}</p>
        `;
        card.addEventListener('click', () => openZine(zine));
        galleryGrid.appendChild(card);
    });
}

// ─── Render Loop ───────────────────────────
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    controls.update();

    // 展開図のふわっと浮遊
    if (state.phase === 'flat' && rigRoot) {
        const t = clock.getElapsedTime();
        rigRoot.position.y = Math.sin(t * 0.8) * 0.03;
    }

    renderer.render(scene, camera);
}

// ─── Resize ────────────────────────────────
window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
});

// ─── Boot ──────────────────────────────────
initGallery();
animate();
loadingScreen.classList.add('fade-out');
setTimeout(() => { loadingScreen.style.display = 'none'; }, 700);
