import {
  BoxGeometry, BufferAttribute,
  Color,
  CanvasTexture,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  OrthographicCamera,
  Scene,
  Sprite,
  SpriteMaterial,
  WebGLRenderer
} from 'three';

export type GameGridData = {
  owner: Uint8Array;
  color: Uint8Array;
  effect?: Uint8Array;
  type?: Uint8Array;
};

export type GameGridDiff = {
  indices: Uint32Array | number[];
  owner?: Uint8Array;
  color?: Uint8Array;
  effect?: Uint8Array;
  type?: Uint8Array;
};

export type GameGridParams = {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  grid: { rows: number; cols: number; colors: Uint8Array };
  palette?: string[];
};

export class GameGrid {
  private readonly canvas: HTMLCanvasElement;
  private width: number;
  private height: number;
  private readonly gridConfig: { rows: number; cols: number; colors: Uint8Array };
  private cellWidth = 1;
  private cellHeight = 1;

  private renderer?: WebGLRenderer;
  private camera?: OrthographicCamera;
  private scene?: Scene;
  private boardMesh?: InstancedMesh;
  private animationFrameId?: number;
  private player1StartMarker?: Sprite;
  private player2StartMarker?: Sprite;

  private paletteColors: Color[] = [];
  private ownerData?: Uint8Array;
  private colorData?: Uint8Array;
  private effectData?: Uint8Array;
  private typeData?: Uint8Array;

  private readonly defaultColor = new Color(0x2c7be5);

  constructor(params: GameGridParams) {
    this.canvas = params.canvas;
    this.width = params.width;
    this.height = params.height;
    this.gridConfig = params.grid;
    this.colorData = params.grid.colors;

    if (params.palette) {
      this.setPalette(params.palette);
    }
  }

  init(): void {
    this.initializeScene();
    this.createBoard();
    this.updateLayout(this.width, this.height);
    this.refreshAllColors();
  }

  start(): void {
    if (this.animationFrameId !== undefined) {
      return;
    }

    const renderLoop = () => {
      if (!this.renderer || !this.scene || !this.camera) {
        return;
      }

      this.animationFrameId = requestAnimationFrame(renderLoop);
      this.renderer.render(this.scene, this.camera);
    };

    renderLoop();
  }

  stop(): void {
    if (this.animationFrameId !== undefined) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = undefined;
    }
  }

  updateLayout(width: number, height: number): void {
    this.width = width;
    this.height = height;

    if (!this.renderer || !this.camera) {
      return;
    }

    this.renderer.setSize(width, height, false);

    this.cellWidth = width / this.gridConfig.cols;
    this.cellHeight = height / this.gridConfig.rows;

    const gridWidth = this.cellWidth * this.gridConfig.cols;
    const gridHeight = this.cellHeight * this.gridConfig.rows;

    this.camera.left = -gridWidth / 2;
    this.camera.right = gridWidth / 2;
    this.camera.top = gridHeight / 2;
    this.camera.bottom = -gridHeight / 2;
    this.camera.near = 0.1;
    this.camera.far = 100;
    this.camera.updateProjectionMatrix();

    this.updateInstanceLayout();
    this.updateStartMarkerTransforms();
  }

  setPalette(palette: string[]): void {
    this.paletteColors = palette.map((color) => new Color(color));
    this.refreshAllColors();
  }

  setGridData(data: GameGridData): void {
    this.ownerData = data.owner;
    this.colorData = data.color;
    this.effectData = data.effect;
    this.typeData = data.type;

    this.refreshAllColors();
  }

  updateColors(colors: Uint8Array): void {
    if (colors.length !== this.gridConfig.cols * this.gridConfig.rows) {
      return;
    }

    this.colorData = colors;
    this.refreshAllColors();
  }

  applyDiff(diff: GameGridDiff): void {
    if (!this.boardMesh) {
      return;
    }

    const indices = Array.from(diff.indices);

    indices.forEach((index, idx) => {
      if (diff.owner && this.ownerData) {
        this.ownerData[index] = diff.owner[idx];
      }

      if (diff.color && this.colorData) {
        this.colorData[index] = diff.color[idx];
        this.applyColorToInstance(index);
      }

      if (diff.effect && this.effectData) {
        this.effectData[index] = diff.effect[idx];
      }

      if (diff.type && this.typeData) {
        this.typeData[index] = diff.type[idx];
      }
    });

    if (this.boardMesh.instanceColor) {
      this.boardMesh.instanceColor.needsUpdate = true;
    }
  }

  dispose(): void {
    this.stop();

    this.renderer?.dispose();
    this.boardMesh?.geometry.dispose();

    this.disposeMarker(this.player1StartMarker);
    this.disposeMarker(this.player2StartMarker);

    if (this.boardMesh?.material) {
      if (Array.isArray(this.boardMesh.material)) {
        this.boardMesh.material.forEach((material) => material.dispose());
      } else {
        this.boardMesh.material.dispose();
      }
    }

    this.scene?.clear();

    this.renderer = undefined;
    this.camera = undefined;
    this.scene = undefined;
    this.boardMesh = undefined;
  }

  private initializeScene(): void {
    this.scene = new Scene();
    this.scene.background = new Color(0x111217);

    this.camera = new OrthographicCamera();
    this.camera.position.set(0, 0, 10);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }

  private createBoard(): void {
    if (!this.scene) return;

    const { cols, rows } = this.gridConfig;

    const cellGeometry = new BoxGeometry(0.98, 0.98, 0.1);

    // add WHITE vertex colors so instanceColor can tint it
    const vCount = cellGeometry.getAttribute('position').count;
    const vColors = new Float32Array(vCount * 3);
    vColors.fill(1); // white
    cellGeometry.setAttribute('color', new BufferAttribute(vColors, 3));

    const cellMaterial = new MeshBasicMaterial({ color: 0xffffff, vertexColors: true,
    });
    cellMaterial.vertexColors = true;
    cellMaterial.needsUpdate = true;
    const totalCells = cols * rows;
    const instancedMesh = new InstancedMesh(cellGeometry, cellMaterial, totalCells);

    // IMPORTANT: assign BEFORE setting colors via helper
    this.boardMesh = instancedMesh;

    const tempObject = new Object3D();

    for (let index = 0; index < cols * rows; index++) {
      tempObject.position.set(0, 0, 0);
      tempObject.updateMatrix();
      instancedMesh.setMatrixAt(index, tempObject.matrix);

      const c = this.paletteColors[0] ?? this.defaultColor;
      instancedMesh.setColorAt(index, c);
    }

    if (instancedMesh.instanceColor) instancedMesh.instanceColor.needsUpdate = true;

    this.scene.add(instancedMesh);

    this.createStartMarkers();
  }

  private updateInstanceLayout(): void {
    if (!this.boardMesh) {
      return;
    }

    const { cols, rows } = this.gridConfig;
    const xOffset = ((cols - 1) * this.cellWidth) / 2;
    const yOffset = ((rows - 1) * this.cellHeight) / 2;
    const tempObject = new Object3D();

    let index = 0;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        tempObject.position.set(col * this.cellWidth - xOffset, yOffset - row * this.cellHeight, 0);
        tempObject.scale.set(this.cellWidth, this.cellHeight, 1);
        tempObject.updateMatrix();
        this.boardMesh.setMatrixAt(index, tempObject.matrix);
        index++;
      }
    }

    this.boardMesh.instanceMatrix.needsUpdate = true;
  }

  private createStartMarkers(): void {
    if (!this.scene) {
      return;
    }

    const player1Marker = this.createMarkerSprite('1', '#00d97e', '#0a1f0f');
    const player2Marker = this.createMarkerSprite('2', '#e63757', '#2a0c12');

    player1Marker.raycast = () => {};
    player2Marker.raycast = () => {};

    this.player1StartMarker = player1Marker;
    this.player2StartMarker = player2Marker;

    this.scene.add(player1Marker);
    this.scene.add(player2Marker);
  }

  private createMarkerSprite(label: string, background: string, textColor: string): Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;

    const ctx = canvas.getContext('2d');

    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = background;
      ctx.beginPath();
      ctx.arc(canvas.width / 2, canvas.height / 2, canvas.width * 0.45, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = textColor;
      ctx.font = 'bold 140px Inter, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, canvas.width / 2, canvas.height / 2 + 6);
    }

    const texture = new CanvasTexture(canvas);
    texture.needsUpdate = true;

    const material = new SpriteMaterial({ map: texture, depthWrite: false });
    const sprite = new Sprite(material);
    sprite.renderOrder = 1;

    return sprite;
  }

  private updateStartMarkerTransforms(): void {
    if (!this.player1StartMarker || !this.player2StartMarker) {
      return;
    }

    const { cols, rows } = this.gridConfig;
    const xOffset = ((cols - 1) * this.cellWidth) / 2;
    const yOffset = ((rows - 1) * this.cellHeight) / 2;
    const markerSize = Math.min(this.cellWidth, this.cellHeight) * 0.6;
    const zOffset = 0.6;

    const setMarker = (marker: Sprite, index: number) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      marker.position.set(col * this.cellWidth - xOffset, yOffset - row * this.cellHeight, zOffset);
      marker.scale.set(markerSize, markerSize, 1);
    };

    setMarker(this.player1StartMarker, 0);
    setMarker(this.player2StartMarker, cols * rows - 1);
  }


  private refreshAllColors(): void {
    if (!this.boardMesh) {
      return;
    }

    const totalCells = this.gridConfig.cols * this.gridConfig.rows;

    for (let index = 0; index < totalCells; index += 1) {
      this.applyColorToInstance(index);
    }

    if (this.boardMesh.instanceColor) {
      this.boardMesh.instanceColor.needsUpdate = true;
    }
  }

  private applyColorToInstance(index: number): void {
    if (!this.boardMesh) {
      return;
    }

    const colorIndex = this.colorData ? this.colorData[index] : undefined;
    const color =
      (colorIndex !== undefined && this.paletteColors[colorIndex]) ||
      this.paletteColors[0] ||
      this.defaultColor;

    this.boardMesh.setColorAt(index, color);
  }

  private disposeMarker(marker?: Sprite): void {
    if (!marker) {
      return;
    }

    if (marker.material instanceof SpriteMaterial) {
      marker.material.map?.dispose();
      marker.material.dispose();
    }

    this.scene?.remove(marker);
  }
}
