import {
  Color,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  WebGLRenderer,
} from 'three';

export interface GridData {
  rows: number;
  cols: number;
  paletteSize: number;
  colors: Uint8Array | number[];
}

export interface GridDiff {
  colors?: Array<{ index: number; color: number }>;
}

export interface GridConfig {
  palette: readonly string[];
  hoverLightness?: number;
  clearColor?: string;
}

export interface RendererCallbacks {
  onHover?: (cellId: number) => void;
  onClick?: (cellId: number) => void;
}

interface GridLayout {
  cellWidth: number;
  cellHeight: number;
  offsetX: number;
  offsetY: number;
}

interface CellAppearanceStrategy {
  setupMaterial(material: MeshBasicMaterial): void;
  applyBaseColors(mesh: InstancedMesh, palette: Color[], colors: Uint8Array | number[]): void;
  applyHover(mesh: InstancedMesh, palette: Color[], colors: Uint8Array | number[], hoverId: number): void;
}

class ColorFillAppearance implements CellAppearanceStrategy {
  constructor(private readonly hoverLift: number) {}

  private baseColors: Color[] = [];

  setupMaterial(material: MeshBasicMaterial): void {
    material.vertexColors = true;
  }

  applyBaseColors(mesh: InstancedMesh, palette: Color[], colors: Uint8Array | number[]): void {
    this.baseColors = new Array(colors.length);
    const color = new Color();
    for (let i = 0; i < colors.length; i++) {
      const baseColor = palette[colors[i]] ?? palette[0];
      this.baseColors[i] = baseColor;
      color.copy(baseColor);
      mesh.setColorAt(i, color);
    }
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
  }

  applyHover(mesh: InstancedMesh, palette: Color[], colors: Uint8Array | number[], hoverId: number): void {
    if (!mesh.instanceColor) {
      return;
    }
    const color = new Color();
    for (let i = 0; i < colors.length; i++) {
      const base = this.baseColors[i] ?? palette[colors[i]] ?? palette[0];
      if (i === hoverId) {
        color.copy(base).offsetHSL(0, 0, this.hoverLift);
      } else {
        color.copy(base);
      }
      mesh.setColorAt(i, color);
    }
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
  }
}

class GridLayoutCalculator {
  compute(containerWidth: number, containerHeight: number, rows: number, cols: number): GridLayout {
    const cellWidth = containerWidth / cols;
    const cellHeight = containerHeight / rows;
    const offsetX = -containerWidth / 2 + cellWidth / 2;
    const offsetY = containerHeight / 2 - cellHeight / 2;
    return { cellWidth, cellHeight, offsetX, offsetY };
  }
}

export class GridRenderer {
  private scene?: Scene;
  private camera?: OrthographicCamera;
  private renderer?: WebGLRenderer;
  private mesh?: InstancedMesh;
  private container?: HTMLElement;
  private data?: GridData;
  private layout?: GridLayout;
  private palette: Color[] = [];
  private appearance: CellAppearanceStrategy;
  private callbacks?: RendererCallbacks;
  private width = 0;
  private height = 0;
  private hoverId = -1;
  private layoutCalculator = new GridLayoutCalculator();

  constructor() {
    this.appearance = new ColorFillAppearance(0.15);
  }

  init(container: HTMLElement, config: GridConfig, callbacks: RendererCallbacks): void {
    console.log('[GridRenderer] init', { containerSize: { w: container.clientWidth, h: container.clientHeight }, config });
    this.validatePalette(config.palette);
    this.palette = config.palette.map((c) => new Color(c));
    this.appearance = new ColorFillAppearance(config.hoverLightness ?? 0.15);
    this.callbacks = callbacks;
    this.container = container;
    this.scene = new Scene();
    this.camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    this.camera.position.z = 2;

    this.renderer = new WebGLRenderer({ antialias: true });
    if (config.clearColor) {
      this.renderer.setClearColor(config.clearColor);
    }
    this.renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(this.renderer.domElement);
    this.resize(container.clientWidth, container.clientHeight);
  }

  setData(data: GridData): void {
    console.log('[GridRenderer] setData', data);
    this.validateData(data);
    this.data = data;
    this.rebuildMesh();
    this.renderFrame();
  }

  applyDiff(_diff: GridDiff): void {
    // Placeholder for future diff-based updates
  }

  setHover(cellId: number | -1): void {
    if (!this.mesh || !this.data) return;
    if (cellId === this.hoverId) return;
    console.log('[GridRenderer] hover', { cellId });
    this.hoverId = cellId;
    this.appearance.applyHover(this.mesh, this.palette, this.data.colors, cellId);
    this.renderFrame();
    this.callbacks?.onHover?.(cellId);
  }

  pickCell(localX: number, localY: number): number {
    if (!this.layout || !this.data) return -1;
    const col = Math.floor(localX / this.layout.cellWidth);
    const row = Math.floor(localY / this.layout.cellHeight);
    if (row < 0 || col < 0 || row >= this.data.rows || col >= this.data.cols) {
      return -1;
    }
    return row * this.data.cols + col;
  }

  handleClick(cellId: number): void {
    if (cellId < 0) return;
    console.log('[GridRenderer] click', { cellId });
    this.callbacks?.onClick?.(cellId);
  }

  resize(width: number, height: number): void {
    console.log('[GridRenderer] resize', { width, height });
    this.width = width;
    this.height = height;
    if (!this.renderer || !this.camera) return;

    this.renderer.setSize(width, height, false);
    this.camera.left = -width / 2;
    this.camera.right = width / 2;
    this.camera.top = height / 2;
    this.camera.bottom = -height / 2;
    this.camera.updateProjectionMatrix();

    if (this.data) {
      this.layout = this.layoutCalculator.compute(width, height, this.data.rows, this.data.cols);
      this.updateInstanceTransforms();
      this.renderFrame();
    }
  }

  dispose(): void {
    this.mesh?.geometry.dispose();
    (this.mesh?.material as MeshBasicMaterial | undefined)?.dispose();
    this.renderer?.dispose();
    if (this.renderer && this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }

  private rebuildMesh(): void {
    if (!this.scene || !this.data) return;
    console.log('[GridRenderer] rebuildMesh', {
      instances: this.data.rows * this.data.cols,
      rows: this.data.rows,
      cols: this.data.cols,
    });
    this.mesh?.removeFromParent();
    this.mesh?.geometry.dispose();

    const geometry = new PlaneGeometry(1, 1);
    const material = new MeshBasicMaterial();
    this.appearance.setupMaterial(material);
    this.mesh = new InstancedMesh(geometry, material, this.data.rows * this.data.cols);
    this.scene.add(this.mesh);
    this.layout = this.layoutCalculator.compute(this.width, this.height, this.data.rows, this.data.cols);
    this.updateInstanceTransforms();
    this.appearance.applyBaseColors(this.mesh, this.palette, this.data.colors);
  }

  private updateInstanceTransforms(): void {
    if (!this.mesh || !this.layout || !this.data) return;
    const { cellWidth, cellHeight, offsetX, offsetY } = this.layout;
    console.log('[GridRenderer] update transforms', { cellWidth, cellHeight, offsetX, offsetY });
    const translation = new Matrix4();
    const scale = new Matrix4().makeScale(cellWidth, cellHeight, 1);
    const matrix = new Matrix4();

    for (let row = 0; row < this.data.rows; row++) {
      for (let col = 0; col < this.data.cols; col++) {
        const index = row * this.data.cols + col;
        const x = offsetX + col * cellWidth;
        const y = offsetY - row * cellHeight;
        translation.makeTranslation(x, y, 0);
        matrix.copy(translation).multiply(scale);
        this.mesh.setMatrixAt(index, matrix);
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  private validatePalette(palette: readonly string[]): void {
    if (!palette.length) {
      throw new Error('Palette must contain at least one color');
    }
  }

  private validateData(data: GridData): void {
    if (data.rows <= 0 || data.cols <= 0) {
      throw new Error('Grid dimensions must be positive');
    }
    const expected = data.rows * data.cols;
    if (data.colors.length !== expected) {
      throw new Error(`Colors length ${data.colors.length} does not match grid size ${expected}`);
    }
    if (data.paletteSize <= 0) {
      throw new Error('Palette size must be positive');
    }
    for (const value of data.colors) {
      if (value < 0 || value >= data.paletteSize) {
        throw new Error(`Color index ${value} is out of range`);
      }
    }
    if (this.palette.length && data.paletteSize > this.palette.length) {
      throw new Error('Palette size exceeds configured palette');
    }
  }

  private renderFrame(): void {
    if (!this.renderer || !this.scene || !this.camera) return;
    this.renderer.render(this.scene, this.camera);
  }
}
