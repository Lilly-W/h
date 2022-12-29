import GUI from 'lil-gui';
import * as THREE from 'three';

import { SoftBodiesSimulation } from '../pkg';
import { memory } from '../pkg/index_bg.wasm';
import { Demo, Scene, SceneConfig, Grabber } from './lib';

const DEFAULT_NUM_SOLVER_SUBSTEPS = 10;
const DEFAULT_EDGE_COMPLIANCE = 100.0;
const DEFAULT_VOL_COMPLIANCE = 0.0;

type SoftBodiesDemoProps = {
    tets: number;
    animate: boolean;
    substeps: number;
    volumeCompliance: number;
    edgeCompliance: number;
    squash: () => void;
    addBody: () => void;
};

const SoftBodiesDemoConfig: SceneConfig = {
    cameraYZ: [1, 2],
    cameraLookAt: new THREE.Vector3(0, 0, 0),
}

class SoftBodiesDemo implements Demo<SoftBodiesSimulation, SoftBodiesDemoProps> {
    sim: SoftBodiesSimulation;
    scene: Scene;
    props: SoftBodiesDemoProps;

    private grabber: Grabber;
    private surfaceMesh: THREE.Mesh;
    private positions: Float32Array;

    constructor(rust_wasm: any, canvas: HTMLCanvasElement, scene: Scene, folder: GUI) {
        this.sim = new rust_wasm.SoftBodiesSimulation(DEFAULT_NUM_SOLVER_SUBSTEPS, DEFAULT_EDGE_COMPLIANCE, DEFAULT_VOL_COMPLIANCE);
        this.scene = scene;
        this.initControls(folder, canvas);
    }

    init() {
        this.initMesh();
    }

    update() {
        if (this.props.animate) {
            this.sim.step();
            this.updateMesh();
            this.grabber.increaseTime(this.sim.dt());
        }
    }

    reset() {
        this.sim.reset();
        this.updateMesh();
    }

    private initControls(folder: GUI, canvas: HTMLCanvasElement) {
        this.props = {
            tets: this.sim.num_tets(),
            animate: true,
            substeps: DEFAULT_NUM_SOLVER_SUBSTEPS,
            volumeCompliance: DEFAULT_VOL_COMPLIANCE,
            edgeCompliance: DEFAULT_EDGE_COMPLIANCE,
            squash: () => { },
            addBody: () => { },
        };
        folder.add(this.props, 'tets').disable();
        folder.add(this.props, 'substeps').min(1).max(30).step(1).onChange((v: number) => this.sim.set_solver_substeps(v));
        folder.add(this.props, 'volumeCompliance').name('volume compliance').min(0).max(500).step(5).onChange((v: number) => this.sim.set_volume_compliance(v));
        folder.add(this.props, 'edgeCompliance').name('edge compliance').min(0).max(500).step(5).onChange((v: number) => this.sim.set_edge_compliance(v));
        const animateController = folder.add(this.props, 'animate');
        folder.add(this.props, 'squash');
        folder.add(this.props, 'addBody').name('add body');

        // grab handler
        this.grabber = new Grabber(this.sim, canvas, this.scene, this.props, animateController);
    }

    private initMesh() {
        const surface_tri_ids = Array.from(this.sim.surface_tri_ids());

        // NOTE: ordering matters here. The sim.mesh_*() getter methods are lazily implemented and 
        // allocate into a new Vec to collect results into at runtime. This means a heap allocation
        // occurs and therefore the location in memory for particle positions changes. Here, we
        // store the pointer to the positions buffer location after these allocs. In the WASM
        // linear heap, it will be constant thereafter, so we don't need to touch the array moving 
        // forward.
        const positionsPtr = this.sim.particle_positions_ptr();
        this.positions = new Float32Array(memory.buffer, positionsPtr, this.sim.num_particles() * 3);

        // visual tri mesh
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
        geometry.setIndex(surface_tri_ids);
        const visMaterial = new THREE.MeshPhongMaterial({ color: 0xF02000, side: THREE.DoubleSide });
        visMaterial.flatShading = true;
        this.surfaceMesh = new THREE.Mesh(geometry, visMaterial);
        this.surfaceMesh.castShadow = true;
        this.surfaceMesh.layers.enable(1);
        this.scene.scene.add(this.surfaceMesh);
        geometry.computeVertexNormals();

        this.updateMesh();
    }

    private updateMesh() {
        this.surfaceMesh.geometry.computeVertexNormals();
        this.surfaceMesh.geometry.attributes.position.needsUpdate = true;
        this.surfaceMesh.geometry.computeBoundingSphere();
    }
}

export { SoftBodiesDemo, SoftBodiesDemoConfig };
