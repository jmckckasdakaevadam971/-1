import React, { useEffect, useRef } from 'react';
import L from 'leaflet';

function colorByStatus(status) {
  if (status === 'ok') return '#20bf55';
  if (status === 'replace') return '#ff3b30';
  if (status === 'in_progress') return '#ffd60a';
  if (status === 'off') return '#7d8597';
  return '#adb5bd';
}

function markerIcon(status, selected) {
  const border = selected ? '2px solid #ffffff' : '1px solid rgba(255,255,255,0.6)';
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="width:16px;height:16px;border-radius:50%;background:${colorByStatus(status)};border:${border};box-shadow:0 0 0 1px rgba(0,0,0,0.4)"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });
}

function droneIcon(status) {
  const statusClass = status === 'charging' ? 'drone-marker-charging' : 'drone-marker-flying';
  return L.divIcon({
    className: 'custom-drone-marker',
    html: `<div class="drone-marker ${statusClass}"><span class="drone-ring"></span><span class="drone-core"></span><span class="drone-arm arm-x"></span><span class="drone-arm arm-y"></span></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15]
  });
}

function dockMarkerStateClass(dock, drone) {
  if (!dock.isOperational || drone?.isOperational === false) {
    return 'dock-marker-danger';
  }

  if ((dock.fullContainers ?? 0) <= 0) {
    return 'dock-marker-warning';
  }

  return 'dock-marker-normal';
}

function dockIcon(stateClass) {
  return L.divIcon({
    className: 'custom-dock-marker',
    html: `<div class="dock-marker ${stateClass}"><span class="dock-marker-core"></span></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11]
  });
}

function dockPopupHtml(dock, drone) {
  const droneOperational = drone?.isOperational ? 'исправен' : 'неисправен';
  const droneStatusClass = drone?.isOperational ? 'ok' : 'bad';
  const dockOperational = dock.isOperational ? 'исправна' : 'неисправна';
  const dockStatusClass = dock.isOperational ? 'ok' : 'bad';
  const isDroneOnDock = Boolean(
    drone?.position
      && Math.abs(drone.position.lat - dock.lat) < 0.00001
      && Math.abs(drone.position.lng - dock.lng) < 0.00001
  );
  const containerLampsRemaining = Number.isFinite(drone?.containerLampsRemaining)
    ? drone.containerLampsRemaining
    : 0;

  const hasDroneContainer = Boolean(drone) && containerLampsRemaining > 0;
  const droneContainerMeta = hasDroneContainer
    ? { label: 'да', className: 'ok' }
    : { label: 'нет', className: 'bad' };

  return `
    <div class="dock-popup-card">
      <div class="dock-popup-title">${dock.name}</div>
      <div class="dock-popup-subtitle">Док-станция на крыше • высота ${dock.roofHeightM} м</div>
      <div class="dock-popup-grid">
        <div class="dock-popup-row"><span>Контейнеры со сменными лампочками</span><strong>${dock.fullContainers}</strong></div>
        <div class="dock-popup-row"><span>Пустые контейнеры</span><strong>${dock.emptyContainers}</strong></div>
        <div class="dock-popup-row"><span>Исправность дрона</span><span class="dock-badge ${droneStatusClass}">${droneOperational}</span></div>
        <div class="dock-popup-row"><span>Заряд дрона</span><strong>${drone?.battery ?? 0}%</strong></div>
        ${isDroneOnDock ? `<div class="dock-popup-row"><span>Остаток ламп в контейнере дрона</span><strong>${containerLampsRemaining}/5</strong></div>` : ''}
        <div class="dock-popup-row"><span>Есть ли на дроне контейнер</span><span class="dock-badge ${droneContainerMeta.className}">${droneContainerMeta.label}</span></div>
        <div class="dock-popup-row"><span>Исправность док-станции</span><span class="dock-badge ${dockStatusClass}">${dockOperational}</span></div>
      </div>
    </div>
  `;
}

function lampStatusMeta(status) {
  if (status === 'ok') return { label: 'исправен', className: 'ok' };
  if (status === 'replace') return { label: 'требует замены', className: 'bad' };
  if (status === 'in_progress') return { label: 'обслуживается', className: 'info' };
  if (status === 'off') return { label: 'отключен', className: 'bad' };
  return { label: status, className: 'info' };
}

function lampPopupHtml(lamp) {
  const status = lampStatusMeta(lamp.status);
  return `
    <div class="lamp-popup-card">
      <div class="lamp-popup-title">${lamp.name}</div>
      <div class="lamp-popup-subtitle">Столб освещения</div>
      <div class="lamp-popup-grid">
        <div class="lamp-popup-row"><span>Статус</span><span class="lamp-badge ${status.className}">${status.label}</span></div>
        <div class="lamp-popup-row"><span>Питание</span><strong>${lamp.powerOn ? 'вкл' : 'выкл'}</strong></div>
        <div class="lamp-popup-row"><span>Потребление</span><strong>${lamp.energyW} W</strong></div>
        <div class="lamp-popup-row"><span>Температура среды</span><strong>${lamp.ambientTemp}°C</strong></div>
      </div>
    </div>
  `;
}

export function MapPanel({ lamps, docks, drones, drone, selectedLampId, selectedLampIds, onSelectLamp, onToggleMissionLamp }) {
  const mapNodeRef = useRef(null);
  const mapRef = useRef(null);
  const markersLayerRef = useRef(null);
  const lampMarkersRef = useRef(new Map());
  const dockMarkersRef = useRef(new Map());
  const droneMarkersRef = useRef(new Map());
  const droneAheadLayersRef = useRef(new Map());
  const openLampPopupIdRef = useRef(null);
  const openDockPopupIdRef = useRef(null);

  const trailColorByIndex = (index) => {
    const palette = ['#60a5fa', '#22d3ee', '#a78bfa', '#34d399', '#f59e0b', '#f472b6'];
    return palette[index % palette.length];
  };

  useEffect(() => {
    if (!mapNodeRef.current || mapRef.current) {
      return;
    }

    const map = L.map(mapNodeRef.current, {
      zoomControl: true,
      minZoom: 10,
      maxZoom: 19
    }).setView([55.7963, 49.1088], 12);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    markersLayerRef.current = L.layerGroup().addTo(map);

    map.on('click', () => {
      openLampPopupIdRef.current = null;
      openDockPopupIdRef.current = null;
      map.closePopup();
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markersLayerRef.current = null;
      lampMarkersRef.current.clear();
      dockMarkersRef.current.clear();
      droneMarkersRef.current.clear();
      droneAheadLayersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!markersLayerRef.current) {
      return;
    }
    const lampMarkers = lampMarkersRef.current;
    const dockMarkers = dockMarkersRef.current;
    const droneMarkers = droneMarkersRef.current;
    const droneAheadLayers = droneAheadLayersRef.current;
    const dronesList = Array.isArray(drones) && drones.length > 0 ? drones : (drone ? [drone] : []);
    const lampById = new Map(lamps.map((item) => [item.id, item]));

    const lampIds = new Set(lamps.map((lamp) => lamp.id));
    lampMarkers.forEach((marker, lampId) => {
      if (!lampIds.has(lampId)) {
        marker.remove();
        lampMarkers.delete(lampId);
      }
    });

    lamps.forEach((lamp) => {
      const selected = selectedLampIds.includes(lamp.id);
      let marker = lampMarkers.get(lamp.id);

      if (!marker) {
        marker = L.marker([lamp.lat, lamp.lng], {
          icon: markerIcon(lamp.status, selected)
        }).addTo(markersLayerRef.current);

        marker.bindPopup(lampPopupHtml(lamp), {
          closeButton: false,
          autoClose: true,
          className: 'lamp-popup-modern'
        });

        lampMarkers.set(lamp.id, marker);
      } else {
        marker.setLatLng([lamp.lat, lamp.lng]);
        marker.setIcon(markerIcon(lamp.status, selected));
        marker.setPopupContent(lampPopupHtml(lamp));
      }

      marker.off('click');
      marker.on('click', () => {
        const wasOpen = marker.isPopupOpen();
        onSelectLamp(lamp.id);
        onToggleMissionLamp(lamp.id);

        if (wasOpen) {
          marker.closePopup();
          openLampPopupIdRef.current = null;
          return;
        }

        openDockPopupIdRef.current = null;
        openLampPopupIdRef.current = lamp.id;
        marker.openPopup();
      });
    });

    const dockIds = new Set(docks.map((dock) => dock.id));
    dockMarkers.forEach((marker, dockId) => {
      if (!dockIds.has(dockId)) {
        marker.remove();
        dockMarkers.delete(dockId);
      }
    });

    docks.forEach((dock) => {
      const dockDrone = dronesList.find((item) => (item?.homeDockId ?? item?.activeDockId) === dock.id) ?? null;
      const dockStateClass = dockMarkerStateClass(dock, dockDrone);
      let marker = dockMarkers.get(dock.id);

      if (!marker) {
        marker = L.marker([dock.lat, dock.lng], { icon: dockIcon(dockStateClass) }).addTo(markersLayerRef.current);
        marker.bindPopup(dockPopupHtml(dock, dockDrone), {
          closeButton: false,
          autoClose: true,
          className: 'dock-popup-modern'
        });
        dockMarkers.set(dock.id, marker);
      } else {
        marker.setLatLng([dock.lat, dock.lng]);
        marker.setIcon(dockIcon(dockStateClass));
        marker.setPopupContent(dockPopupHtml(dock, dockDrone));
      }

      marker.off('click');
      marker.on('click', () => {
        if (marker.isPopupOpen()) {
          marker.closePopup();
          openDockPopupIdRef.current = null;
          return;
        }

        openLampPopupIdRef.current = null;
        openDockPopupIdRef.current = dock.id;
        marker.openPopup();
      });
    });

    if (openLampPopupIdRef.current) {
      const marker = lampMarkers.get(openLampPopupIdRef.current);
      if (marker && !marker.isPopupOpen()) {
        marker.openPopup();
      }
    }

    if (openDockPopupIdRef.current) {
      const marker = dockMarkers.get(openDockPopupIdRef.current);
      if (marker && !marker.isPopupOpen()) {
        marker.openPopup();
      }
    }

    const visibleDroneIds = new Set(
      dronesList
        .filter((item) => item?.status === 'enroute' || item?.status === 'replacing')
        .map((item) => item.id)
    );

    droneMarkers.forEach((marker, droneId) => {
      if (!visibleDroneIds.has(droneId)) {
        marker.remove();
        droneMarkers.delete(droneId);
      }
    });

    droneAheadLayers.forEach((aheadLayer, droneId) => {
      if (!visibleDroneIds.has(droneId)) {
        aheadLayer.remove();
        droneAheadLayers.delete(droneId);
      }
    });

    dronesList.forEach((item, index) => {
      const shouldShowDrone = item?.status === 'enroute' || item?.status === 'replacing';
      if (!shouldShowDrone || !item?.position?.lat || !item?.position?.lng) {
        return;
      }

      const droneLatLng = [item.position.lat, item.position.lng];
      let droneMarker = droneMarkers.get(item.id);

      if (!droneMarker) {
        droneMarker = L.marker(droneLatLng, {
          icon: droneIcon(item.status),
          zIndexOffset: 1000
        }).addTo(markersLayerRef.current);
        droneMarkers.set(item.id, droneMarker);
      } else {
        droneMarker.setLatLng(droneLatLng);
        droneMarker.setIcon(droneIcon(item.status));
      }

      droneMarker.setPopupContent(
        `<b>Дрон ${item.id}</b><br/>Статус: ${item.status}<br/>Заряд: ${item.battery}%<br/>Док-станция: ${item.homeDockId ?? item.activeDockId ?? '—'}`
      );

      const targetLamp = lampById.get(item.targetLampId);
      const shouldShowAhead = item.status === 'enroute' && targetLamp;
      if (shouldShowAhead) {
        const aheadPoints = [
          [item.position.lat, item.position.lng],
          [targetLamp.lat, targetLamp.lng]
        ];

        let aheadLayer = droneAheadLayers.get(item.id);
        if (!aheadLayer) {
          aheadLayer = L.polyline(aheadPoints, {
            color: trailColorByIndex(index),
            weight: 2,
            opacity: 0.9,
            dashArray: '6 6',
            className: 'drone-ahead-route'
          }).addTo(markersLayerRef.current);
          droneAheadLayers.set(item.id, aheadLayer);
        } else {
          aheadLayer.setLatLngs(aheadPoints);
        }
      } else {
        const aheadLayer = droneAheadLayers.get(item.id);
        if (aheadLayer) {
          aheadLayer.remove();
          droneAheadLayers.delete(item.id);
        }
      }

    });
  }, [lamps, docks, drones, drone, selectedLampId, selectedLampIds, onSelectLamp, onToggleMissionLamp]);

  return <div className="map" ref={mapNodeRef} />;
}
