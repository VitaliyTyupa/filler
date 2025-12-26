import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import {
  BoxGeometry,
  Color,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  OrthographicCamera,
  Scene,
  WebGLRenderer
} from 'three';

@Component({
  selector: 'fil-game-page',
  standalone: true,
  imports: [],
  templateUrl: './game-page.component.html',
  styleUrl: './game-page.component.scss'
})
export class GamePageComponent implements AfterViewInit, OnDestroy {
  @ViewChild('boardContainer', { static: true })
  private boardContainer?: ElementRef<HTMLDivElement>;

  private renderer?: WebGLRenderer;
  private camera?: OrthographicCamera;
  private scene?: Scene;
  private boardMesh?: InstancedMesh;
  private animationFrameId?: number;

  private readonly gridWidth = 40;
  private readonly gridHeight = 25;
  private readonly cellSize = 1;

  ngAfterViewInit(): void {
    if (!this.boardContainer) {
      return;
    }

    this.initializeScene();
    this.createBoard();
    this.handleResize();
    window.addEventListener('resize', this.handleResize);
    this.startRendering();
  }

  ngOnDestroy(): void {
    window.removeEventListener('resize', this.handleResize);
    if (this.animationFrameId !== undefined) {
      cancelAnimationFrame(this.animationFrameId);
    }

    this.renderer?.dispose();
    this.renderer?.domElement.remove();
    this.boardMesh?.geometry.dispose();
    if (Array.isArray(this.boardMesh?.material)) {
      this.boardMesh.material.forEach((material) => material.dispose());
    } else {
      this.boardMesh?.material.dispose();
    }
    this.scene?.clear();
  }

  private initializeScene(): void {
    const container = this.boardContainer!.nativeElement;

    this.scene = new Scene();
    this.scene.background = new Color(0x111217);

    this.camera = new OrthographicCamera();
    this.camera.position.set(0, 0, 10);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);
  }

  private createBoard(): void {
    if (!this.scene) {
      return;
    }

    const cellGeometry = new BoxGeometry(this.cellSize * 0.92, this.cellSize * 0.92, 0.1);
    const cellMaterial = new MeshBasicMaterial({ color: 0x2c7be5 });
    const totalCells = this.gridWidth * this.gridHeight;
    const instancedMesh = new InstancedMesh(cellGeometry, cellMaterial, totalCells);

    const tempObject = new Object3D();
    const xOffset = ((this.gridWidth - 1) * this.cellSize) / 2;
    const yOffset = ((this.gridHeight - 1) * this.cellSize) / 2;

    let index = 0;
    for (let row = 0; row < this.gridHeight; row += 1) {
      for (let col = 0; col < this.gridWidth; col += 1) {
        tempObject.position.set(col * this.cellSize - xOffset, yOffset - row * this.cellSize, 0);
        tempObject.updateMatrix();
        instancedMesh.setMatrixAt(index, tempObject.matrix);
        index += 1;
      }
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
    this.boardMesh = instancedMesh;
    this.scene.add(instancedMesh);
  }

  private handleResize = (): void => {
    if (!this.renderer || !this.camera || !this.boardContainer) {
      return;
    }

    const container = this.boardContainer.nativeElement;
    const { clientWidth, clientHeight } = container;
    this.renderer.setSize(clientWidth, clientHeight, false);

    const viewWidth = this.gridWidth * this.cellSize;
    const viewHeight = this.gridHeight * this.cellSize;
    const gridAspect = viewWidth / viewHeight;
    const containerAspect = clientWidth / clientHeight || 1;

    if (containerAspect > gridAspect) {
      const scale = containerAspect / gridAspect;
      this.camera.left = -viewWidth / 2 * scale;
      this.camera.right = viewWidth / 2 * scale;
      this.camera.top = viewHeight / 2;
      this.camera.bottom = -viewHeight / 2;
    } else {
      const scale = gridAspect / containerAspect;
      this.camera.left = -viewWidth / 2;
      this.camera.right = viewWidth / 2;
      this.camera.top = viewHeight / 2 * scale;
      this.camera.bottom = -viewHeight / 2 * scale;
    }

    this.camera.near = 0.1;
    this.camera.far = 100;
    this.camera.updateProjectionMatrix();
  };

  private startRendering(): void {
    const renderLoop = () => {
      if (!this.renderer || !this.scene || !this.camera) {
        return;
      }

      this.animationFrameId = requestAnimationFrame(renderLoop);
      this.renderer.render(this.scene, this.camera);
    };

    renderLoop();
  }
}
