import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

function emissiveByLamp(lamp) {
  if (!lamp) return '#3a3a3a';
  if (!lamp.cassettePresent) return '#1d1d1d';
  if (lamp.status === 'replace') return '#ff3b30';
  if (lamp.status === 'in_progress') return '#ff9f0a';
  if (lamp.powerOn) return '#f8ff9a';
  return '#4d4d4d';
}

function createPole(scene, position, materials, lamp) {
  const pole = new THREE.Group();
  pole.position.copy(position);
  scene.add(pole);

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.31, 4.4, 28), materials.poleMaterial);
  base.position.y = 1.8;
  base.castShadow = true;
  base.receiveShadow = true;
  pole.add(base);

  const flange = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.08, 28), materials.darkMetalMaterial);
  flange.position.y = 0.08;
  flange.castShadow = true;
  flange.receiveShadow = true;
  pole.add(flange);

  for (let index = 0; index < 6; index += 1) {
    const angle = (Math.PI * 2 * index) / 6;
    const bolt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.05, 12),
      new THREE.MeshStandardMaterial({ color: '#c3d2e0', metalness: 0.88, roughness: 0.14 })
    );
    bolt.position.set(Math.cos(angle) * 0.34, 0.11, Math.sin(angle) * 0.34);
    bolt.castShadow = true;
    pole.add(bolt);
  }

  const housing = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.42, 0.92), materials.frameMaterial);
  housing.position.set(0.92, 3.74, 0);
  housing.castShadow = true;
  housing.receiveShadow = true;
  pole.add(housing);

  const topCover = new THREE.Mesh(
    new THREE.BoxGeometry(2.18, 0.08, 0.82),
      const targetPos = new THREE.Vector3().lerpVectors(activeSegment.from, activeSegment.to, p);
      droneRig.position.lerp(targetPos, shouldAnimateReplace ? 0.22 : 0.06);

      if (activeSegment.type === 'extract' && activeSegment.poleIndex !== null) {
        const poleRef = poles[activeSegment.poleIndex];
        const socketWorld = new THREE.Vector3();
        poleRef.socket.getWorldPosition(socketWorld);
        const slotAWorld = new THREE.Vector3();
        slotA.getWorldPosition(slotAWorld);

        extractedCassette.visible = true;
        extractedCassette.position.lerpVectors(socketWorld, slotAWorld, p);
        poleRef.cassetteGroup.visible = p < 0.9;
        if (p > 0.9) {
          extractedCassette.visible = false;
          cassetteInSlotA.visible = true;
        }
      }

      if (activeSegment.type === 'shift') {
        carriageTarget = activeSegment.carriageFrom + (activeSegment.carriageTo - activeSegment.carriageFrom) * p;
        const poleRef = poles[activeSegment.poleIndex];
        poleRef.cassetteGroup.visible = false;
        cassetteInSlotA.visible = true;
      }

      if (activeSegment.type === 'insert' && activeSegment.poleIndex !== null) {
        const poleRef = poles[activeSegment.poleIndex];
        const socketWorld = new THREE.Vector3();
        poleRef.socket.getWorldPosition(socketWorld);
        const slotBWorld = new THREE.Vector3();
        slotB.getWorldPosition(slotBWorld);

        insertionCassette.visible = true;
        insertionCassette.position.lerpVectors(slotBWorld, socketWorld, p);
        poleRef.cassetteGroup.visible = p > 0.9;
        cassetteInSlotA.visible = true;
        cassetteInSlotB.visible = p < 0.9 && modulesCount > 0;

        if (p > 0.9) {
          insertionCassette.visible = false;
        }
      }

      carriage.position.x += (carriageTarget - carriage.position.x) * 0.24;

      droneRig.rotation.y = 0.18 + Math.sin(elapsed * 0.42) * 0.04;
      droneRig.rotation.x = Math.sin(elapsed * 1.2) * 0.01;

      if (importedDrone) {
        importedDrone.rotation.y = Math.sin(elapsed * 0.4) * 0.03;
      }

      controls.update();
      renderer.render(scene, camera);
      rafRef.current = requestAnimationFrame(animate);
    };

    animate();

    const resizeObserver = new ResizeObserver(() => {
      if (!mountRef.current) return;
      const nextWidth = mountRef.current.clientWidth;
      const nextHeight = mountRef.current.clientHeight;
      renderer.setSize(nextWidth, nextHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
    });

    resizeObserver.observe(mountRef.current);

    return () => {
      cancelAnimationFrame(rafRef.current);
      resizeObserver.disconnect();

    segments.push({ type: 'descend', duration: 1.4, from: hover(poleIndex), to: replace(poleIndex), poleIndex });
    segments.push({ type: 'extract', duration: 1.8, from: replace(poleIndex), to: replace(poleIndex), poleIndex });
    segments.push({ type: 'shift', duration: 1.2, from: replace(poleIndex), to: replace(poleIndex), poleIndex, carriageFrom: -1.12, carriageTo: 1.12 });
    segments.push({ type: 'insert', duration: 1.8, from: replace(poleIndex), to: replace(poleIndex), poleIndex });
    segments.push({ type: 'ascend', duration: 1.2, from: replace(poleIndex), to: hover(poleIndex), poleIndex });

    if (nextPoleIndex !== undefined) {
      segments.push({ type: 'travel', duration: 2.8, from: hover(poleIndex), to: hover(nextPoleIndex), poleIndex: nextPoleIndex });
    }
  }

  segments.push({ type: 'travel', duration: 4.2, from: hover(route[route.length - 1]), to: depotHover.clone(), poleIndex: null });
  segments.push({ type: 'dock_descend', duration: 1.5, from: depotHover.clone(), to: depotPickup.clone(), poleIndex: null });
  segments.push({ type: 'reload', duration: 2.2, from: depotPickup.clone(), to: depotPickup.clone(), poleIndex: null });
  segments.push({ type: 'dock_ascend', duration: 1.3, from: depotPickup.clone(), to: depotHover.clone(), poleIndex: null });
  segments.push({ type: 'travel', duration: 4.0, from: depotHover.clone(), to: hover(route[0]), poleIndex: route[0] });

  const totalDuration = segments.reduce((acc, segment) => acc + segment.duration, 0);
  return { segments, totalDuration };
}

export function ModelPanel({ lamp, droneStatus, ambientTemp }) {
  const mountRef = useRef(null);
  const rafRef = useRef(0);
  const [manualAnimation, setManualAnimation] = useState(true);

  const shouldAnimateReplace = lamp?.status === 'in_progress' || manualAnimation;

  const tempColor = useMemo(() => {
    const normalized = Math.max(0, Math.min(1, (ambientTemp + 40) / 90));
    const r = Math.floor(40 + normalized * 180);
    const b = Math.floor(220 - normalized * 180);
    return `rgb(${r}, 120, ${b})`;
  }, [ambientTemp]);

  useEffect(() => {
    if (!mountRef.current) return;

    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0a1220');
    scene.fog = new THREE.Fog('#0a1220', 10, 36);

    const camera = new THREE.PerspectiveCamera(52, width / height, 0.1, 260);
    camera.position.set(8.4, 5.4, 11.2);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.03;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mountRef.current.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 4;
    controls.maxDistance = 45;
    controls.target.set(0.5, 3, -1);

    const hemi = new THREE.HemisphereLight('#dbe7ff', '#1f2a39', 0.65);
    scene.add(hemi);

    const dir = new THREE.DirectionalLight('#fff5de', 1.45);
    dir.position.set(12, 15, 8);
    dir.castShadow = true;
    dir.shadow.mapSize.width = 2048;
    dir.shadow.mapSize.height = 2048;
    dir.shadow.camera.left = -14;
    dir.shadow.camera.right = 14;
    dir.shadow.camera.top = 14;
    dir.shadow.camera.bottom = -14;
    scene.add(dir);

    const rim = new THREE.DirectionalLight('#7bb4ff', 0.46);
    rim.position.set(-10, 6, -12);
    scene.add(rim);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(36, 36),
      new THREE.MeshStandardMaterial({ color: '#101b2b', roughness: 0.97, metalness: 0.03 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const grid = new THREE.GridHelper(36, 58, tempColor, '#223046');
    grid.position.y = 0.02;
    scene.add(grid);

    const materials = {
      poleMaterial: new THREE.MeshStandardMaterial({ color: '#8f9fb3', metalness: 0.42, roughness: 0.46 }),
      frameMaterial: new THREE.MeshStandardMaterial({ color: '#4f647d', metalness: 0.58, roughness: 0.32 }),
      darkMetalMaterial: new THREE.MeshStandardMaterial({ color: '#263648', metalness: 0.58, roughness: 0.35 })
    };

    const polePositions = [
      new THREE.Vector3(2.2, 0, -0.4),
      new THREE.Vector3(8.6, 0, 2.8),
      new THREE.Vector3(5.1, 0, -8.2),
      new THREE.Vector3(-2.8, 0, -4.8)
    ];
    const poles = polePositions.map((position) => createPole(scene, position, materials, lamp));

    const depot = new THREE.Group();
    depot.position.set(-9.2, 0, -6.5);
    scene.add(depot);

    const depotPad = new THREE.Mesh(
      new THREE.CylinderGeometry(1.9, 2.2, 0.14, 28),
      new THREE.MeshStandardMaterial({ color: '#1f3448', roughness: 0.72, metalness: 0.16 })
    );
    depotPad.position.y = 0.08;
    depotPad.receiveShadow = true;
    depot.add(depotPad);

    const depotRack = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 1.8, 1.4),
      new THREE.MeshStandardMaterial({ color: '#36506a', roughness: 0.5, metalness: 0.25 })
    );
    depotRack.position.set(0, 0.9, -1.25);
    depotRack.castShadow = true;
    depot.add(depotRack);

    const depotBox = new THREE.Mesh(
      new THREE.BoxGeometry(1.45, 0.52, 1.04),
      new THREE.MeshStandardMaterial({ color: '#2f4359', roughness: 0.48, metalness: 0.22 })
    );
    depotBox.position.set(0, 0.42, 0.66);
    depotBox.castShadow = true;
    depot.add(depotBox);

    const droneRig = new THREE.Group();
    scene.add(droneRig);

    const modelAnchor = new THREE.Group();
    droneRig.add(modelAnchor);

    const payloadRoot = new THREE.Group();
    payloadRoot.position.set(0, -1.05, 0.2);
    droneRig.add(payloadRoot);

    const carriage = new THREE.Group();
    payloadRoot.add(carriage);

    const sliderRail = new THREE.Mesh(
      new THREE.BoxGeometry(3.6, 0.1, 0.28),
      new THREE.MeshStandardMaterial({ color: '#455b73', metalness: 0.62, roughness: 0.25 })
    );
    sliderRail.castShadow = true;
    carriage.add(sliderRail);

    const slotA = new THREE.Mesh(
      new THREE.BoxGeometry(1.28, 0.3, 0.68),
      new THREE.MeshStandardMaterial({ color: '#95a8bc', metalness: 0.48, roughness: 0.35 })
    );
    slotA.position.set(-1.14, -0.25, 0);
    slotA.castShadow = true;
    carriage.add(slotA);

    const slotB = new THREE.Mesh(
      new THREE.BoxGeometry(1.28, 0.3, 0.68),
      new THREE.MeshStandardMaterial({ color: '#2ac76f', metalness: 0.35, roughness: 0.42 })
    );
    slotB.position.set(1.14, -0.25, 0);
    slotB.castShadow = true;
    carriage.add(slotB);

    const cassetteInSlotA = new THREE.Mesh(
      new THREE.BoxGeometry(1.04, 0.16, 0.5),
      new THREE.MeshStandardMaterial({ color: '#7f93aa', metalness: 0.48, roughness: 0.4 })
    );
    cassetteInSlotA.position.set(-1.14, -0.12, 0);
    cassetteInSlotA.castShadow = true;
    cassetteInSlotA.visible = false;
    carriage.add(cassetteInSlotA);

    const cassetteInSlotB = new THREE.Mesh(
      new THREE.BoxGeometry(1.04, 0.16, 0.5),
      new THREE.MeshStandardMaterial({ color: '#6f8397', metalness: 0.5, roughness: 0.36 })
    );
    cassetteInSlotB.position.set(1.14, -0.12, 0);
    cassetteInSlotB.castShadow = true;
    carriage.add(cassetteInSlotB);

    const gripper = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.24, 0.24),
      new THREE.MeshStandardMaterial({ color: '#2f4258', metalness: 0.5, roughness: 0.34 })
    );
    gripper.position.set(0, -0.35, 0);
    gripper.castShadow = true;
    carriage.add(gripper);

    const supplyBox = new THREE.Group();
    supplyBox.position.set(0, -0.95, 0.9);
    payloadRoot.add(supplyBox);

    const supplyBody = new THREE.Mesh(
      new THREE.BoxGeometry(1.35, 0.44, 1.0),
      new THREE.MeshStandardMaterial({ color: '#2d4158', metalness: 0.35, roughness: 0.45 })
    );
    supplyBody.castShadow = true;
    supplyBody.receiveShadow = true;
    supplyBox.add(supplyBody);

    const modules = [];
    for (let index = 0; index < 9; index += 1) {
      const module = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 0.08, 0.2),
        new THREE.MeshStandardMaterial({ color: '#8ca2ba', metalness: 0.45, roughness: 0.35 })
      );
      const col = index % 3;
      const row = Math.floor(index / 3);
      module.position.set(-0.38 + col * 0.38, 0.2, -0.27 + row * 0.26);
      module.castShadow = true;
      supplyBox.add(module);
      modules.push(module);
    }

    const extractedCassette = new THREE.Mesh(
      new THREE.BoxGeometry(1.04, 0.16, 0.5),
      new THREE.MeshStandardMaterial({ color: '#7f92a8', metalness: 0.48, roughness: 0.4 })
    );
    extractedCassette.visible = false;
    extractedCassette.castShadow = true;
    extractedCassette.receiveShadow = true;
    scene.add(extractedCassette);

    const insertionCassette = new THREE.Mesh(
      new THREE.BoxGeometry(1.04, 0.16, 0.5),
      new THREE.MeshStandardMaterial({ color: '#8ca1b8', metalness: 0.48, roughness: 0.34 })
    );
    insertionCassette.visible = false;
    insertionCassette.castShadow = true;
    insertionCassette.receiveShadow = true;
    scene.add(insertionCassette);

    let importedDrone = null;
    const loader = new GLTFLoader();
    loader.load(
      '/models/drone.glb',
      (gltf) => {
        importedDrone = gltf.scene;
        importedDrone.scale.setScalar(1.85);
        importedDrone.position.set(0, 0.12, 0);
        importedDrone.traverse((object) => {
          if (object.isMesh) {
            object.castShadow = true;
            object.receiveShadow = true;
          }
        });
        modelAnchor.add(importedDrone);
      },
      undefined,
      () => {
        importedDrone = null;
      }
    );

    const depotHover = new THREE.Vector3(-9.2, 6.0, -6.5);
    const depotPickup = new THREE.Vector3(-9.2, 2.35, -6.5);
    droneRig.position.copy(depotHover);

    const timeline = buildTimeline(poles, depotHover, depotPickup);

    const ledBoost = new THREE.PointLight(emissiveByLamp(lamp), lamp?.powerOn ? 1.5 : 0.25, 8, 2.1);
    ledBoost.position.set(poles[0].pole.position.x + 1.45, 3.42, poles[0].pole.position.z);
    scene.add(ledBoost);

    const clock = new THREE.Clock();

    const animate = () => {
      const elapsed = clock.getElapsedTime();
      const localTime = shouldAnimateReplace ? elapsed % timeline.totalDuration : 0;

      let activeSegment = timeline.segments[0];
      let activeIndex = 0;
      let phaseTime = localTime;

      for (let index = 0; index < timeline.segments.length; index += 1) {
        if (phaseTime <= timeline.segments[index].duration) {
          activeSegment = timeline.segments[index];
          activeIndex = index;
          break;
        }
        phaseTime -= timeline.segments[index].duration;
      }

      const p = activeSegment.duration > 0 ? Math.max(0, Math.min(1, phaseTime / activeSegment.duration)) : 1;

      let modulesCount = 9;
      for (let index = 0; index < activeIndex; index += 1) {
        const segment = timeline.segments[index];
        if (segment.type === 'insert') modulesCount = Math.max(0, modulesCount - 1);
        if (segment.type === 'reload') modulesCount = 9;
      }
      if (activeSegment.type === 'insert' && p > 0.9) modulesCount = Math.max(0, modulesCount - 1);
      if (activeSegment.type === 'reload') modulesCount = Math.max(modulesCount, Math.round(modulesCount + (9 - modulesCount) * p));

      modules.forEach((module, index) => {
        module.visible = index < modulesCount;
      });

      poles.forEach((poleRef) => {
        poleRef.cassetteGroup.visible = true;
      });

      extractedCassette.visible = false;
      insertionCassette.visible = false;
      cassetteInSlotB.visible = modulesCount > 0;
      cassetteInSlotA.visible = false;
      let carriageTarget = 0;
+
+      const targetPos = new THREE.Vector3().lerpVectors(activeSegment.from, activeSegment.to, p);
+      droneRig.position.lerp(targetPos, shouldAnimateReplace ? 0.22 : 0.06);
+
+      if (activeSegment.type === 'extract' && activeSegment.poleIndex !== null) {
+        const poleRef = poles[activeSegment.poleIndex];
+        const socketWorld = new THREE.Vector3();
+        poleRef.socket.getWorldPosition(socketWorld);
+        const slotAWorld = new THREE.Vector3();
+        slotA.getWorldPosition(slotAWorld);
+
+        extractedCassette.visible = true;
+        extractedCassette.position.lerpVectors(socketWorld, slotAWorld, p);
+        poleRef.cassetteGroup.visible = p < 0.9;
+        if (p > 0.9) {
+          extractedCassette.visible = false;
+          cassetteInSlotA.visible = true;
+        }
+      }
+
+      if (activeSegment.type === 'shift') {
+        carriageTarget = activeSegment.carriageFrom + (activeSegment.carriageTo - activeSegment.carriageFrom) * p;
+        const poleRef = poles[activeSegment.poleIndex];
+        poleRef.cassetteGroup.visible = false;
+        cassetteInSlotA.visible = true;
+      }
+
+      if (activeSegment.type === 'insert' && activeSegment.poleIndex !== null) {
+        const poleRef = poles[activeSegment.poleIndex];
+        const socketWorld = new THREE.Vector3();
+        poleRef.socket.getWorldPosition(socketWorld);
+        const slotBWorld = new THREE.Vector3();
+        slotB.getWorldPosition(slotBWorld);
+
+        insertionCassette.visible = true;
+        insertionCassette.position.lerpVectors(slotBWorld, socketWorld, p);
+        poleRef.cassetteGroup.visible = p > 0.9;
+        cassetteInSlotA.visible = true;
+        cassetteInSlotB.visible = p < 0.9 && modulesCount > 0;
+
+        if (p > 0.9) {
+          insertionCassette.visible = false;
+        }
+      }
+
+      carriage.position.x += (carriageTarget - carriage.position.x) * 0.24;
+
+      droneRig.rotation.y = 0.18 + Math.sin(elapsed * 0.42) * 0.04;
+      droneRig.rotation.x = Math.sin(elapsed * 1.2) * 0.01;
+
+      if (importedDrone) {
+        importedDrone.rotation.y = Math.sin(elapsed * 0.4) * 0.03;
+      }
+
+      controls.update();
+      renderer.render(scene, camera);
      rafRef.current = requestAnimationFrame(animate);
    };

    animate();

    const resizeObserver = new ResizeObserver(() => {
      if (!mountRef.current) return;
      const nextWidth = mountRef.current.clientWidth;
      const nextHeight = mountRef.current.clientHeight;
      renderer.setSize(nextWidth, nextHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
    });

    resizeObserver.observe(mountRef.current);

    return () => {
      cancelAnimationFrame(rafRef.current);
      resizeObserver.disconnect();
      controls.dispose();
      if (importedDrone) modelAnchor.remove(importedDrone);
      renderer.dispose();
      mountRef.current?.removeChild(renderer.domElement);
    };
  }, [lamp, shouldAnimateReplace, tempColor]);

  return (
    <div className="model-panel">
      <div className="model-toolbar">
        <span>3D: длинный маршрут по столбам + док-станция + ручной обзор</span>
        <button type="button" onClick={() => setManualAnimation((value) => !value)}>
          {manualAnimation ? 'Остановить анимацию' : 'Визуализировать замену'}
        </button>
      </div>
      <div ref={mountRef} className="model-canvas" />
      <div className="model-note">
        <span>Статус дрона: {droneStatus}</span>
        <span>Температура среды: {ambientTemp}°C</span>
      </div>
    </div>
  );
}
