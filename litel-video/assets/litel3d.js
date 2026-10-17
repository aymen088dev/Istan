/**
 * Décor 3D de la pub Litel — three.js, rendu déterministe piloté par la timeline.
 *
 *   window.LITEL3D.render(t)   // t en secondes, 0 → 35,5
 *
 * Trois décors se relaient, calés sur les plans de la composition :
 *   · la rue au crépuscule (0 → 7,5) : caméra qui avance vers la boutique
 *   · le rayon (20,5 → 28,5) : allée de supermarché, travelling avant
 *   · la carte finale (28,5 → 35,5) : plaque LITEL en volume, rotation douce
 *
 * Si WebGL est indisponible, le module ne fait rien et la composition garde
 * ses décors CSS : le film reste lisible.
 */
(function () {
  const T = window.THREE;
  if (!T) return;

  const W = 1080;
  const H = 1920;
  const NAVY = 0x0a2a5e;
  const GOLD = 0xffd400;
  const RED = 0xe63946;
  const CREAM = 0xfff8e6;

  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

  /* ---------------------------------------------------------------- */
  /* rendu                                                            */
  /* ---------------------------------------------------------------- */

  let renderer;
  try {
    renderer = new T.WebGLRenderer({ antialias: false, alpha: false, powerPreference: "high-performance" });
  } catch (err) {
    return;
  }
  if (!renderer || !renderer.getContext || renderer.getContext() === null) return;

  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;

  const canvas = renderer.domElement;
  canvas.id = "gl";
  canvas.style.width = W + "px";
  canvas.style.height = H + "px";

  /* ---------------------------------------------------------------- */
  /* textures peintes au canvas                                        */
  /* ---------------------------------------------------------------- */

  function texture(w, h, draw) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    draw(c.getContext("2d"), w, h);
    const tex = new T.CanvasTexture(c);
    tex.colorSpace = T.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }

  let s = 0x1d2f5b;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };

  /* façade d'immeuble : grille de fenêtres, quelques-unes allumées */
  const facadeTex = texture(256, 512, (g, w, h) => {
    g.fillStyle = "#0a1526";
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 7; x++) {
        const lit = rand() > 0.42;
        const warm = rand();
        g.fillStyle = lit
          ? warm > 0.75
            ? "#ffe6b0"
            : warm > 0.4
              ? "#ffc773"
              : "#8fb6d8"
          : "#101d31";
        g.fillRect(10 + x * 34, 12 + y * 30, 22, 18);
      }
    }
    g.fillStyle = "rgba(255,255,255,0.05)";
    for (let x = 0; x < 7; x++) g.fillRect(10 + x * 34, 0, 2, h);
  });
  facadeTex.wrapS = facadeTex.wrapT = T.RepeatWrapping;

  /* dalle de sol carrelée */
  const tileTex = texture(256, 256, (g, w, h) => {
    const g1 = g.createLinearGradient(0, 0, 0, h);
    g1.addColorStop(0, "#fffaf0");
    g1.addColorStop(1, "#efe4cf");
    g.fillStyle = g1;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(10,42,94,0.16)";
    g.lineWidth = 3;
    for (let i = 0; i <= 4; i++) {
      g.beginPath();
      g.moveTo((i * w) / 4, 0);
      g.lineTo((i * w) / 4, h);
      g.stroke();
      g.beginPath();
      g.moveTo(0, (i * h) / 4);
      g.lineTo(w, (i * h) / 4);
      g.stroke();
    }
  });
  tileTex.wrapS = tileTex.wrapT = T.RepeatWrapping;
  tileTex.repeat.set(4, 16);

  const glowTex = texture(128, 128, (g, w, h) => {
    const rad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    rad.addColorStop(0, "rgba(255,255,255,1)");
    rad.addColorStop(0.35, "rgba(255,214,120,0.55)");
    rad.addColorStop(1, "rgba(255,180,60,0)");
    g.fillStyle = rad;
    g.fillRect(0, 0, w, h);
  });

  const signTex = texture(1024, 256, (g, w, h) => {
    g.fillStyle = "#ffd400";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#0a2a5e";
    g.font = "900 168px Inter, Arial, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("LITEL", w / 2, h / 2 + 8);
    g.fillStyle = "#e63946";
    g.fillRect(w * 0.18, h - 34, w * 0.64, 14);
  });

  const plaqueTex = texture(1024, 1024, (g, w, h) => {
    g.fillStyle = "#ffd400";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#0a2a5e";
    g.font = "900 560px Inter, Arial, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("L", w / 2, h / 2 - 40);
    g.fillStyle = "#e63946";
    g.save();
    g.translate(w / 2, h * 0.78);
    g.transform(1, 0, -0.32, 1, 0, 0);
    g.fillRect(-w * 0.28, -22, w * 0.56, 44);
    g.restore();
    g.strokeStyle = "rgba(10,42,94,0.18)";
    g.lineWidth = 10;
    g.strokeRect(5, 5, w - 10, h - 10);
  });

  const skyTex = texture(64, 512, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#050f22");
    grad.addColorStop(0.42, "#0d2547");
    grad.addColorStop(0.68, "#3c3a58");
    grad.addColorStop(0.82, "#a85f45");
    grad.addColorStop(1, "#f3a45f");
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });

  /* ---------------------------------------------------------------- */
  /* matériaux partagés                                               */
  /* ---------------------------------------------------------------- */

  const mat = (color, opts) => new T.MeshStandardMaterial(Object.assign({ color, roughness: 0.72, metalness: 0.08 }, opts));
  const glow = (color, opacity) =>
    new T.MeshBasicMaterial({ color, transparent: true, opacity, blending: T.AdditiveBlending, depthWrite: false });

  const addGlow = (parent, size, color, opacity, x, y, z, rotX) => {
    const m = new T.Mesh(new T.PlaneGeometry(size, size), glow(color, opacity));
    m.position.set(x, y, z);
    if (rotX !== undefined) m.rotation.x = rotX;
    parent.add(m);
    return m;
  };

  /* ---------------------------------------------------------------- */
  /* décor 1 · la rue                                                 */
  /* ---------------------------------------------------------------- */

  function buildStreet() {
    const scene = new T.Scene();
    scene.fog = new T.FogExp2(0x101f38, 0.021);
    scene.background = new T.Color(0x0a1730);

    const camera = new T.PerspectiveCamera(62, W / H, 0.1, 220);

    /* ciel en fond lointain */
    const sky = new T.Mesh(
      new T.PlaneGeometry(240, 120),
      new T.MeshBasicMaterial({ map: skyTex, depthWrite: false, fog: false }),
    );
    sky.position.set(0, 22, -110);
    scene.add(sky);

    const sun = addGlow(scene, 40, 0xffb066, 0.55, 0, 9, -104, 0);
    sun.material.map = glowTex;

    scene.add(new T.HemisphereLight(0x4a6a9c, 0x161c28, 0.85));
    const moon = new T.DirectionalLight(0xa8c4f0, 0.55);
    moon.position.set(-6, 14, 6);
    scene.add(moon);
    const warm = new T.DirectionalLight(0xffa860, 0.4);
    warm.position.set(5, 3, -14);
    scene.add(warm);

    /* sol mouillé */
    const road = new T.Mesh(new T.PlaneGeometry(11, 120), mat(0x121a27, { roughness: 0.28, metalness: 0.55 }));
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0, -40);
    scene.add(road);

    const walkMat = mat(0x1b2536, { roughness: 0.9, metalness: 0.1 });
    for (const side of [-1, 1]) {
      const walk = new T.Mesh(new T.BoxGeometry(4.2, 0.24, 120), walkMat);
      walk.position.set(side * 7.6, 0.12, -40);
      scene.add(walk);
      const kerb = new T.Mesh(new T.BoxGeometry(0.22, 0.34, 120), mat(0x2a3446, { roughness: 0.8 }));
      kerb.position.set(side * 5.55, 0.17, -40);
      scene.add(kerb);
    }

    /* ligne centrale discontinue */
    for (let z = 10; z > -70; z -= 6) {
      const dash = new T.Mesh(new T.PlaneGeometry(0.16, 2.6), new T.MeshBasicMaterial({ color: 0x6f7f96 }));
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(0, 0.012, z);
      scene.add(dash);
    }

    /* immeubles */
    const facadeMat = mat(0x2a3550, {
      map: facadeTex,
      emissive: 0xffc27a,
      emissiveMap: facadeTex,
      emissiveIntensity: 0.55,
      roughness: 0.9,
    });
    const facadeMatB = mat(0x243049, {
      map: facadeTex,
      emissive: 0xffb066,
      emissiveMap: facadeTex,
      emissiveIntensity: 0.42,
      roughness: 0.9,
    });

    let block = 0;
    for (let z = 8; z > -62; z -= 8.5) {
      for (const side of [-1, 1]) {
        if (z < -44 && Math.abs(side) === 1) continue; /* la boutique occupe le fond */
        const h = 9 + rand() * 16;
        const b = new T.Mesh(new T.BoxGeometry(8, h, 8.2), block % 2 ? facadeMat : facadeMatB);
        b.position.set(side * (9.4 + rand() * 1.4), h / 2, z);
        scene.add(b);
        block++;
      }
    }

    /* réverbération des fenêtres sur l'asphalte */
    for (let z = 6; z > -60; z -= 8.5) {
      for (const side of [-1, 1]) {
        addGlow(scene, 9, 0xffb066, 0.05, side * 7.5, 0.02, z, -Math.PI / 2);
      }
    }

    /* réverbères */
    const lampMat = mat(0x11192a, { metalness: 0.6, roughness: 0.4 });
    const lamps = [];
    for (let z = 2; z > -58; z -= 12) {
      for (const side of [-1, 1]) {
        const post = new T.Mesh(new T.CylinderGeometry(0.09, 0.12, 5.4, 8), lampMat);
        post.position.set(side * 5.9, 2.7, z);
        scene.add(post);

        const bulb = new T.Mesh(new T.SphereGeometry(0.22, 12, 12), new T.MeshBasicMaterial({ color: 0xffe0a0 }));
        bulb.position.set(side * 5.9, 5.42, z);
        scene.add(bulb);

        addGlow(scene, 5.4, 0xffcc88, 0.5, side * 5.9, 5.4, z);
        addGlow(scene, 3.4, 0xffc070, 0.32, side * 5.9, 0.03, z + 0.6, -Math.PI / 2);
        lamps.push(bulb);
      }
    }

    /* la boutique au bout de la rue */
    const shop = new T.Group();
    shop.position.set(0, 0, -52);
    scene.add(shop);

    const shell = new T.Mesh(new T.BoxGeometry(12.4, 7.4, 6), mat(CREAM, { roughness: 0.55 }));
    shell.position.y = 3.7;
    shop.add(shell);

    const awning = new T.Mesh(
      new T.BoxGeometry(12.4, 0.9, 1.2),
      new T.MeshStandardMaterial({
        map: texture(512, 64, (g, w, h) => {
          for (let i = 0; i < 16; i++) {
            g.fillStyle = i % 2 ? "#ffd400" : "#e63946";
            g.fillRect((i * w) / 16, 0, w / 16, h);
          }
        }),
        roughness: 0.7,
      }),
    );
    awning.position.set(0, 5.1, 3.3);
    shop.add(awning);

    const glass = new T.Mesh(new T.PlaneGeometry(10.6, 3.6), new T.MeshBasicMaterial({ color: 0xfff1c8 }));
    glass.position.set(0, 2.5, 3.02);
    shop.add(glass);

    const sign = new T.Mesh(new T.PlaneGeometry(6.4, 1.6), new T.MeshBasicMaterial({ map: signTex }));
    sign.position.set(0, 6.1, 3.05);
    shop.add(sign);

    for (let i = 0; i < 3; i++) {
      const shelf = new T.Mesh(new T.BoxGeometry(3.4, 0.1, 0.5), mat(0xd8cdb8));
      shelf.position.set(-3.4 + i * 3.4, 1.1 + (i % 2) * 1.1, 2.9);
      shop.add(shelf);
    }

    addGlow(shop, 30, 0xffd080, 0.42, 0, 2.6, 3.6);
    addGlow(scene, 26, 0xffc070, 0.3, 0, 0.02, -40, -Math.PI / 2);
    addGlow(shop, 16, 0xffe0a0, 0.3, 0, 0.03, 5.4, -Math.PI / 2);

    const shopLight = new T.PointLight(0xffb45a, 70, 60, 2);
    shopLight.position.set(0, 3.4, 1.5);
    shop.add(shopLight);

    const camera0 = new T.Vector3(0, 1.68, 13);
    const target0 = new T.Vector3(0, 2.1, -52);

    return {
      scene,
      camera,
      update(t) {
        const p = clamp01(t / 7.5);
        const ease = p * p * (3 - 2 * p);
        camera.position.set(
          Math.sin(t * 1.7) * 0.12,
          1.68 + Math.sin(t * 3.1) * 0.035 + ease * 0.12,
          camera0.z - ease * 40,
        );
        camera.lookAt(target0.x, target0.y - 0.35 + ease * 0.15, target0.z);
        camera.rotation.z = Math.sin(t * 2.2) * 0.006;
        sign.material.opacity = 1;
        glass.material.color.setHSL(0.11, 0.9, 0.78 + 0.05 * Math.sin(t * 5));
      },
    };
  }

  /* ---------------------------------------------------------------- */
  /* décor 2 · le rayon                                               */
  /* ---------------------------------------------------------------- */

  function buildAisle() {
    const scene = new T.Scene();
    scene.background = new T.Color(0xf6ecd8);
    scene.fog = new T.FogExp2(0xf6ecd8, 0.035);

    const camera = new T.PerspectiveCamera(64, W / H, 0.1, 120);

    scene.add(new T.HemisphereLight(0xffffff, 0xe6d9bf, 1.05));
    const key = new T.DirectionalLight(0xfff2d0, 0.75);
    key.position.set(2, 8, 6);
    scene.add(key);
    const fill = new T.DirectionalLight(0xa9c6ff, 0.28);
    fill.position.set(-4, 4, -6);
    scene.add(fill);

    const floor = new T.Mesh(new T.PlaneGeometry(8, 46), new T.MeshStandardMaterial({ map: tileTex, roughness: 0.32, metalness: 0.06 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, -16);
    scene.add(floor);

    /* plafond + tubes lumineux */
    const ceiling = new T.Mesh(new T.PlaneGeometry(8, 46), mat(0xf3e9d6, { roughness: 1 }));
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, 3.3, -16);
    scene.add(ceiling);
    for (let z = 5; z > -34; z -= 4) {
      const tube = new T.Mesh(new T.PlaneGeometry(2.6, 0.26), new T.MeshBasicMaterial({ color: 0xfffdf2 }));
      tube.rotation.x = Math.PI / 2;
      tube.position.set(0, 3.27, z);
      scene.add(tube);
      addGlow(scene, 4.4, 0xfff3cf, 0.16, 0, 3.25, z, Math.PI / 2);
    }

    /* gondoles */
    const frameMat = mat(0x233450, { metalness: 0.35, roughness: 0.5 });
    const boardMat = mat(0xe9dfcb, { roughness: 0.85 });
    const products = [];

    for (const side of [-1, 1]) {
      const g = new T.Group();
      g.position.set(side * 2.05, 0, -14);
      scene.add(g);

      const back = new T.Mesh(new T.BoxGeometry(0.12, 2.6, 36), frameMat);
      back.position.set(side * 0.42, 1.3, 0);
      g.add(back);

      for (let level = 0; level < 4; level++) {
        const y = 0.35 + level * 0.62;
        const board = new T.Mesh(new T.BoxGeometry(0.92, 0.07, 36), boardMat);
        board.position.set(0, y, 0);
        g.add(board);

        const rail = new T.Mesh(new T.BoxGeometry(0.05, 0.05, 36), frameMat);
        rail.position.set(-side * 0.46, y - 0.02, 0);
        g.add(rail);

        /* produits : boîtes de tailles et couleurs variées */
        let z = -17.4;
        while (z < 17.4) {
          const w = 0.16 + rand() * 0.2;
          const h = 0.24 + rand() * 0.34;
          const d = 0.16 + rand() * 0.22;
          products.push({
            x: side * 2.05 - side * (0.02 + rand() * 0.2),
            y: y + 0.035 + h / 2,
            z: z + 14,
            w,
            h,
            d,
            color: [0xe63946, 0xffd400, 0x1f5fbf, 0x2f8f5b, 0xd86a2a, 0xffffff, 0x8a3fa0][Math.floor(rand() * 7)],
          });
          z += w + 0.03 + rand() * 0.05;
        }
      }
    }

    const boxGeo = new T.BoxGeometry(1, 1, 1);
    const inst = new T.InstancedMesh(boxGeo, mat(0xffffff, { roughness: 0.55, metalness: 0.05 }), products.length);
    const dummy = new T.Object3D();
    const col = new T.Color();
    products.forEach((p, i) => {
      dummy.position.set(p.x, p.y, p.z);
      dummy.scale.set(p.w, p.h, p.d);
      dummy.rotation.y = 0;
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
      inst.setColorAt(i, col.setHex(p.color));
    });
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    scene.add(inst);

    /* tête de gondole LITEL au fond */
    const end = new T.Group();
    end.position.set(0, 0, -33.4);
    scene.add(end);
    const panel = new T.Mesh(new T.BoxGeometry(3.6, 3, 0.4), mat(CREAM));
    panel.position.y = 1.5;
    end.add(panel);
    const endSign = new T.Mesh(new T.PlaneGeometry(3, 0.75), new T.MeshBasicMaterial({ map: signTex }));
    endSign.position.set(0, 2.2, 0.24);
    end.add(endSign);
    addGlow(end, 10, 0xffd400, 0.25, 0, 2, 0.6);

    /* panneaux de prix suspendus */
    for (let i = 0; i < 3; i++) {
      const z = -4 - i * 9;
      const tag = new T.Mesh(
        new T.PlaneGeometry(1.5, 0.42),
        new T.MeshBasicMaterial({
          map: texture(256, 72, (g, w, h) => {
            g.fillStyle = "#e63946";
            g.fillRect(0, 0, w, h);
            g.fillStyle = "#fff8e6";
            g.font = "900 42px Inter, Arial, sans-serif";
            g.textAlign = "center";
            g.textBaseline = "middle";
            g.fillText("PETITS PRIX", w / 2, h / 2 + 2);
          }),
        }),
      );
      tag.position.set(0, 2.62, z);
      tag.rotation.y = 0.06 * (i % 2 ? 1 : -1);
      scene.add(tag);
    }

    return {
      scene,
      camera,
      update(t) {
        const p = clamp01((t - 20.5) / 8);
        const ease = p * p * (3 - 2 * p);
        camera.position.set(ease * 0.5 - 0.1, 1.52 + Math.sin(t * 2.4) * 0.02, 6.4 - ease * 16);
        camera.lookAt(ease * 0.18, 1.5, -30);
        camera.rotation.z = Math.sin(t * 1.9) * 0.008;
      },
    };
  }

  /* ---------------------------------------------------------------- */
  /* décor 3 · la carte finale                                       */
  /* ---------------------------------------------------------------- */

  function buildCard() {
    const scene = new T.Scene();
    scene.background = new T.Color(0x081f45);

    const camera = new T.PerspectiveCamera(42, W / H, 0.1, 60);
    camera.position.set(0, 1.32, 8.4);

    scene.add(new T.AmbientLight(0x8ea6c8, 0.5));
    const key = new T.DirectionalLight(0xffeec2, 1.5);
    key.position.set(3, 5, 6);
    scene.add(key);
    const rim = new T.DirectionalLight(0x5f8fd8, 1.1);
    rim.position.set(-5, 2, -4);
    scene.add(rim);
    const gold = new T.PointLight(0xffcf5a, 26, 22, 2);
    gold.position.set(0, 0.4, 4);
    scene.add(gold);

    /* fond dégradé */
    const back = new T.Mesh(
      new T.PlaneGeometry(26, 26),
      new T.MeshBasicMaterial({
        map: texture(64, 512, (g, w, h) => {
          const grad = g.createLinearGradient(0, 0, 0, h);
          grad.addColorStop(0, "#0d3568");
          grad.addColorStop(0.55, "#08204a");
          grad.addColorStop(1, "#050f26");
          g.fillStyle = grad;
          g.fillRect(0, 0, w, h);
        }),
      }),
    );
    back.position.set(0, 1.4, -9);
    scene.add(back);

    /* sol brillant */
    const floor = new T.Mesh(new T.PlaneGeometry(24, 18), mat(0x061832, { roughness: 0.14, metalness: 0.85 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -1.1, -1);
    scene.add(floor);
    addGlow(scene, 7, 0xffd400, 0.3, 0, -1.08, 0.4, -Math.PI / 2);

    /* plaque LITEL en volume */
    const plaque = new T.Group();
    plaque.position.set(0, 2.05, 0);
    scene.add(plaque);

    const faceMat = new T.MeshStandardMaterial({ map: plaqueTex, roughness: 0.42, metalness: 0.15, emissive: 0x211a00, emissiveIntensity: 0.5 });
    const edgeMat = mat(0xffc400, { roughness: 0.35, metalness: 0.45 });
    const backMat = mat(0xd9b000, { roughness: 0.5, metalness: 0.3 });
    const body = new T.Mesh(new T.BoxGeometry(1.95, 1.95, 0.3), [edgeMat, edgeMat, edgeMat, edgeMat, faceMat, backMat]);
    plaque.add(body);

    /* barre rouge en saillie, comme le logo plat */
    const bar = new T.Mesh(new T.BoxGeometry(1.28, 0.11, 0.08), mat(RED, { roughness: 0.4, metalness: 0.2 }));
    bar.position.set(0, -0.42, 0.19);
    bar.rotation.z = -0.3;
    plaque.add(bar);

    addGlow(scene, 7, 0xffd400, 0.16, 0, 2.05, -1.2);

    return {
      scene,
      camera,
      update(t) {
        const p = clamp01((t - 28.5) / 7);
        const ease = 1 - Math.pow(1 - p, 3);
        plaque.rotation.y = Math.sin(p * Math.PI * 1.15) * 0.34;
        plaque.rotation.x = Math.sin(p * Math.PI * 1.3) * 0.05;
        plaque.position.y = 2.05 + Math.sin(t * 1.4) * 0.03 - (1 - ease) * 0.2;
        plaque.scale.setScalar(0.82 + ease * 0.18);
        camera.position.z = 8.4 - ease * 0.5;
        camera.lookAt(0, 1.05, 0);
      },
    };
  }

  /* ---------------------------------------------------------------- */
  /* pilotage                                                         */
  /* ---------------------------------------------------------------- */

  const street = buildStreet();
  const aisle = buildAisle();
  const card = buildCard();

  let mounted = false;
  function mount() {
    if (mounted) return;
    const stage = document.getElementById("stage");
    if (!stage) return;
    stage.insertBefore(canvas, stage.firstChild);
    stage.classList.add("webgl");
    mounted = true;
    window.dispatchEvent(new Event("litel3d-ready"));
  }

  function active(t) {
    if (t < 7.5) return street;
    if (t >= 20.5 && t < 28.5) return aisle;
    if (t >= 28.5) return card;
    return null;
  }

  let last = null;
  function render(t) {
    mount();
    const world = active(t);
    if (!world) return;
    world.update(t);
    renderer.render(world.scene, world.camera);
    last = t;
  }

  window.LITEL3D = {
    render,
    get ready() {
      return mounted;
    },
    get lastTime() {
      return last;
    },
  };

  render(0);
})();
