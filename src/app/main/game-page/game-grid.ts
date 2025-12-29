import {
  BoxGeometry,
  Color,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  OrthographicCamera,
  Scene,
  WebGLRenderer,
  BufferAttribute
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
  grid: { rows: number; cols: number; cellSize: number };
  palette?: string[];
};

export class GameGrid {
  private readonly canvas: HTMLCanvasElement;
  private width: number;
  private height: number;
  private readonly gridConfig: { rows: number; cols: number; cellSize: number };

  private renderer?: WebGLRenderer;
  private camera?: OrthographicCamera;
  private scene?: Scene;
  private boardMesh?: InstancedMesh;
  private animationFrameId?: number;

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

    if (params.palette) {
      this.setPalette(params.palette);
    }
  }

  init(): void {
    this.initializeScene();
    this.createBoard();
    this.resize(this.width, this.height);
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

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    if (!this.renderer || !this.camera) {
      return;
    }

    this.renderer.setSize(width, height, false);

    const viewWidth = this.gridConfig.cols * this.gridConfig.cellSize;
    const viewHeight = this.gridConfig.rows * this.gridConfig.cellSize;
    const gridAspect = viewWidth / viewHeight;
    const containerAspect = width / height || 1;

    if (containerAspect > gridAspect) {
      const scale = containerAspect / gridAspect;
      this.camera.left = (-viewWidth / 2) * scale;
      this.camera.right = (viewWidth / 2) * scale;
      this.camera.top = viewHeight / 2;
      this.camera.bottom = -viewHeight / 2;
    } else {
      const scale = gridAspect / containerAspect;
      this.camera.left = -viewWidth / 2;
      this.camera.right = viewWidth / 2;
      this.camera.top = (viewHeight / 2) * scale;
      this.camera.bottom = (-viewHeight / 2) * scale;
    }

    this.camera.near = 0.1;
    this.camera.far = 100;
    this.camera.updateProjectionMatrix();
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

    const { cols, rows, cellSize } = this.gridConfig;

    const cellGeometry = new BoxGeometry(cellSize * 0.92, cellSize * 0.92, 0.1);

// add WHITE vertex colors so instanceColor can tint it
    const vCount = cellGeometry.getAttribute('position').count;
    const vColors = new Float32Array(vCount * 3);
    vColors.fill(1); // white
    cellGeometry.setAttribute('color', new BufferAttribute(vColors, 3));

    const cellMaterial = new MeshBasicMaterial({
      color: 0xffffff,
      vertexColors: true,
    });
    cellMaterial.vertexColors = true;
    cellMaterial.needsUpdate = true;
    const totalCells = cols * rows;
    const instancedMesh = new InstancedMesh(cellGeometry, cellMaterial, totalCells);

    // IMPORTANT: assign BEFORE setting colors via helper
    this.boardMesh = instancedMesh;

    const tempObject = new Object3D();
    const xOffset = ((cols - 1) * cellSize) / 2;
    const yOffset = ((rows - 1) * cellSize) / 2;

    let index = 0;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        tempObject.position.set(col * cellSize - xOffset, yOffset - row * cellSize, 0);
        tempObject.updateMatrix();
        instancedMesh.setMatrixAt(index, tempObject.matrix);

        // set color DIRECTLY (don’t rely on boardMesh being set later)
        const c = this.paletteColors[0] ?? this.defaultColor;
        instancedMesh.setColorAt(index, c);

        index++;
      }
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
    if (instancedMesh.instanceColor) instancedMesh.instanceColor.needsUpdate = true;

    this.scene.add(instancedMesh);
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
}
