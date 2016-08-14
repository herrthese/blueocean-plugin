// @flow

import React, { Component, PropTypes } from 'react';
import {getAddIconGroup} from './common';

import type { StageInfo } from './common';

// Dimensions used for layout, px
export const defaultLayout = {
    nodeSpacingH: 120,
    nodeSpacingV: 70,
    nodeRadius: 12,
    curveRadius: 12,
    connectorStrokeWidth: 3.5,
    labelOffsetV: 25,
    smallLabelOffsetV: 20
};

const nodeStrokeWidth = 3.5; //px

// Typedefs

type StageNodeInfo = {
    // -- Shared with PlaceholderNodeInfo
    key: string,
    x: number,
    y: number,
    nodeId: number,
    parentStage?: StageInfo,

    // -- Marker
    isPlaceholder: false,

    // -- Unique
    name: string,
    stage: StageInfo
};

type PlaceholderNodeInfo = {
    // -- Shared with StageNodeInfo
    key: string,
    x: number,
    y: number,
    nodeId: number,
    parentStage?: StageInfo,

    // -- Marker
    isPlaceholder: true,

    // -- Unique
    type: "start" | "add"
}

// TODO: Attempt to extract a "common" node type with intersection operator to remove duplication

type NodeInfo = StageNodeInfo | PlaceholderNodeInfo;

type ConnectionInfo = [NodeInfo, NodeInfo];

type LabelInfo = {
    //key: string,
    x: number,
    y: number,
    text: string,
    node: NodeInfo,
    stage?: StageInfo
};

type LayoutInfo = typeof defaultLayout;

type Props = {
    stages: Array<StageInfo>,
    layout: LayoutInfo,
    onNodeClick: (nodeName:string, id:string) => void,  // TODO: Remove / replace with onStageSelected()?
    selectedStage?: StageInfo
};

export class EditorPipelineGraph extends Component {

    startNode:PlaceholderNodeInfo;

    // Flow typedefs
    state:{
        nodes: Array<NodeInfo>,
        connections: Array<ConnectionInfo>,
        bigLabels: Array<LabelInfo>,
        smallLabels: Array<LabelInfo>,
        measuredWidth: number,
        measuredHeight: number,
        layout: LayoutInfo,
        selectedNode: ?NodeInfo
    };

    constructor(props:Props) {
        super(props);
        this.state = {
            nodes: [],
            connections: [],
            bigLabels: [],
            smallLabels: [],
            measuredWidth: 0,
            measuredHeight: 0,
            layout: Object.assign({}, defaultLayout, props.layout),
            selectedNode: null
        };
    }

    componentWillMount() {
        this.stagesUpdated(this.props.stages);
    }

    componentWillReceiveProps(nextProps:Props) {

        let newState = null; // null == no new state
        let needsLayout = false;

        if (nextProps.layout != this.props.layout) {
            newState = {...newState, layout: Object.assign({}, defaultLayout, this.props.layout)};
            needsLayout = true;
        }

        if (nextProps.selectedStage !== this.props.selectedStage) {
            // If we're just changing selectedStage, we don't need to re-generate the children
            newState = {...newState, selectedStage: nextProps.selectedStage};
        }

        if (nextProps.stages !== this.props.stages) {
            needsLayout = true;
        }

        const doLayoutIfNeeded = () => {
            if (needsLayout) {
                this.stagesUpdated(nextProps.stages);
            }
        };

        if (newState) {
            // If we need to update the state, then we'll delay any layout changes
            this.setState(newState, doLayoutIfNeeded);
        } else {
            doLayoutIfNeeded();
        }
    }

    addConnectionDetails(connections:Array<ConnectionInfo>, previousNodes:Array<NodeInfo>, columnNodes:Array<NodeInfo>) {
        // Connect to top of previous/next column. Curves added when creating SVG

        // Collapse from previous node(s) to top column node
        for (const previousNode of previousNodes) {
            connections.push([previousNode, columnNodes[0]]);
        }

        // Expand from top previous node to column node(s) - first one done already above
        for (const columnNode of columnNodes.slice(1)) {
            connections.push([previousNodes[0], columnNode]);
        }
    }

    stagesUpdated(newStages:Array<StageInfo> = []) {

        // FIXME: Should we calculate based on expected text size guesstimate?
        const ypStart = 50;

        const { nodeSpacingH, nodeSpacingV } = this.state.layout;

        var nodes:Array<NodeInfo> = [];
        var connections:Array<ConnectionInfo> = [];
        var bigLabels:Array<LabelInfo> = [];
        var smallLabels:Array<LabelInfo> = [];

        // next node position
        var xp = nodeSpacingH / 2;
        var yp = ypStart;

        var previousNodes:Array<NodeInfo> = [];
        var mostColumnNodes = 1;
        var placeholderId = -1;

        // 1. First we create a non-stage node for the "start" position
        const startNode:NodeInfo = this.startNode = {
            key: "s_" + placeholderId,
            x: xp,
            y: yp,
            name: "Start",
            nodeId: placeholderId,
            isPlaceholder: true,
            type: "start"
        };

        nodes.push(startNode);
        previousNodes.push(startNode);

        // 2. Give it a small label
        smallLabels.push({
            x: xp,
            y: yp,
            text: "Start",
            node: startNode
        });

        xp += nodeSpacingH; // Start node has its own column

        // 3. For reach top-level stage we have a column of node(s)
        for (const topStage of newStages) {

            yp = ypStart;

            // If stage has children, we don't draw a node for it, just its children
            const nodeStages = topStage.children && topStage.children.length ?
                topStage.children : [topStage];

            const columnNodes:Array<NodeInfo> = [];

            for (const nodeStage of nodeStages) {
                const nodeId = nodeStage.id; // TODO: generateId?()
                const node = {
                    key: "n_" + nodeStage.id,
                    x: xp,
                    y: yp,
                    name: nodeStage.name,
                    nodeId: nodeId,
                    stage: nodeStage,
                    isPlaceholder: false,
                    parentStage: topStage
                };

                columnNodes.push(node);

                if (nodeStage != topStage) {
                    // Only separate child nodes need a smallLabel, as topStage already has a bigLabel
                    smallLabels.push({
                        x: xp,
                        y: yp,
                        text: nodeStage.name,
                        stage: nodeStage,
                        node
                    });
                }

                yp += nodeSpacingV;
            }

            // Always have a single bigLabel per top-level stage

            bigLabels.push({
                x: xp,
                y: ypStart,
                text: topStage.name,
                stage: topStage,
                node: columnNodes[0]
            });

            // Now add a placeholder for "add parallel stage" node.

            placeholderId--;
            const addStagePlaceholder:NodeInfo = {
                key: "a_" + placeholderId,
                x: xp,
                y: yp,
                name: "Add",
                nodeId: placeholderId,
                isPlaceholder: true,
                type: "add",
                parentStage: topStage
            };

            // Placeholder "add" doesn't go in "columnNodes" because we don't connect from it to the next column.
            nodes.push(addStagePlaceholder);
            yp += nodeSpacingV;

            // Add connections from last column to these new nodes

            if (previousNodes.length) {
                this.addConnectionDetails(connections, previousNodes, [...columnNodes, addStagePlaceholder]);
            }

            xp += nodeSpacingH;
            mostColumnNodes = Math.max(mostColumnNodes, nodeStages.length + 1); // +1 for "add"
            nodes.push(...columnNodes);
            previousNodes = columnNodes;
        }

        // 4. Add a final "add" placeholder for new top-level stages

        placeholderId--;
        const addTopLevelStagePlaceholder:NodeInfo = {
            key: "a_" + placeholderId,
            x: xp,
            y: ypStart,
            name: "Add",
            nodeId: placeholderId,
            isPlaceholder: true,
            type: "add"
        };

        nodes.push(addTopLevelStagePlaceholder);
        xp += nodeSpacingH;

        if (previousNodes.length) {
            this.addConnectionDetails(connections, previousNodes.slice(0,1), [addTopLevelStagePlaceholder]);
        }

        // 5. Calc dimensions
        var measuredWidth = xp - Math.floor(nodeSpacingH / 2);
        const measuredHeight = ypStart + (mostColumnNodes * nodeSpacingV);

        this.setState({
            nodes,
            connections,
            bigLabels,
            smallLabels,
            measuredWidth,
            measuredHeight
        });
    }

    renderBigLabel(details:LabelInfo) {

        const { nodeSpacingH, labelOffsetV } = this.state.layout;

        const labelWidth = nodeSpacingH;
        const labelOffsetH = Math.floor(labelWidth * -0.5);

        // These are about layout more than appearance, so they should probably remain inline
        const bigLabelStyle = {
            position: "absolute",
            width: labelWidth,
            textAlign: "center",
            marginLeft: labelOffsetH,
            marginBottom: labelOffsetV
        };

        const x = details.x;
        const bottom = this.state.measuredHeight - details.y;

        const style = Object.assign({}, bigLabelStyle, {
            bottom: bottom + "px",
            left: x + "px"
        });

        const stage = details.stage;
        const key = (stage ? stage.id : details.text) + "-big"; // TODO: Replace with a key on LabelInfo

        const classNames = ["pipeline-big-label"];
        if (this.nodeIsSelected(details.node)
            || (stage && this.stageChildIsSelected(stage))) {
            classNames.push("selected");
        }

        return <div className={classNames.join(" ")} style={style} key={key}>{details.text}</div>;
    }

    renderSmallLabel(details:LabelInfo) {

        const {
            nodeSpacingH,
            curveRadius,
            smallLabelOffsetV } = this.state.layout;

        const smallLabelWidth = nodeSpacingH - (2 * curveRadius); // Fit between lines
        const smallLabelOffsetH = Math.floor(smallLabelWidth * -0.5);

        // These are about layout more than appearance, so they should probably remain inline
        const smallLabelStyle = {
            position: "absolute",
            width: smallLabelWidth,
            textAlign: "center",
            marginLeft: smallLabelOffsetH,
            marginTop: smallLabelOffsetV
        };

        const x = details.x;
        const top = details.y;

        const style = Object.assign({}, smallLabelStyle, {
            top: top,
            left: x
        });

        const stage = details.stage;
        const key = (stage ? stage.id : details.text) + "-small"; // TODO: Replace with a key on LabelInfo

        const classNames = ["pipeline-small-label"];
        if (this.nodeIsSelected(details.node)) {
            classNames.push("selected");
        }

        return <div className={classNames.join(" ")} style={style} key={key}>{details.text}</div>;
    }

    renderConnection(connection:ConnectionInfo) {

        const { nodeRadius, curveRadius, connectorStrokeWidth } = this.state.layout;

        const [leftNode, rightNode] = connection;
        const placeholderLine = leftNode.isPlaceholder || rightNode.isPlaceholder;
        const key = leftNode.key + "_con_" + rightNode.key;

        const leftPos = {
            x: leftNode.x + nodeRadius - (nodeStrokeWidth / 2),
            y: leftNode.y
        };

        const rightPos = {
            x: rightNode.x - nodeRadius + (nodeStrokeWidth / 2),
            y: rightNode.y
        };

        // Stroke props common to straight / curved connections
        let connectorStroke:any = {
            className: "pipeline-connector",
            strokeWidth: connectorStrokeWidth
        };

        if (placeholderLine) {
            connectorStroke.strokeDasharray = "5,2";
        }

        if (leftPos.y == rightPos.y) {
            // Nice horizontal line
            return (<line {...connectorStroke}
                key={key}
                x1={leftPos.x}
                y1={leftPos.y}
                x2={rightPos.x}
                y2={rightPos.y}/>);
        }

        // Otherwise, we'd like a curve

        const verticalDirection = Math.sign(rightPos.y - leftPos.y); // 1 == curve down, -1 == curve up
        const midPointX = Math.round((leftPos.x + rightPos.x) / 2 + (curveRadius * verticalDirection));
        const w1 = midPointX - curveRadius - leftPos.x;
        const w2 = rightPos.x - curveRadius - midPointX;
        const v = rightPos.y - leftPos.y - (2 * curveRadius * verticalDirection); // Will be -ive if curve up
        const cv = verticalDirection * curveRadius;

        const pathData = `M ${leftPos.x} ${leftPos.y}` // start position
                + ` l ${w1} 0` // first horizontal line
                + ` c ${curveRadius} 0 ${curveRadius} ${cv} ${curveRadius} ${cv}`  // turn
                + ` l 0 ${v}` // vertical line
                + ` c 0 ${cv} ${curveRadius} ${cv} ${curveRadius} ${cv}` // turn again
                + ` l ${w2} 0` // second horizontal line
            ;

        return <path {...connectorStroke} key={key} d={pathData} fill="none"/>;
    }

    getNodeChildren(nodeX:NodeInfo):React$Element {

        const {nodeRadius} = this.state.layout;

        if (nodeX.isPlaceholder === true) {
            let node:PlaceholderNodeInfo = nodeX;
            if (node.type === "start") {
                return <circle r={nodeRadius * 0.6} fill="black" stroke="none"/>;
                // TODO: ^^ Put this into styles
            }

            return getAddIconGroup(nodeRadius);
        }

        return <circle r={nodeRadius} fill="none" stroke="pink" strokeWidth={nodeStrokeWidth}/>;
        // TODO: ^^ Put this into styles
    }

    renderNode(node:NodeInfo) {

        const nodeIsSelected = this.nodeIsSelected(node);
        const { nodeRadius, connectorStrokeWidth } = this.state.layout;

        // Use a bigger radius for invisible click/touch target
        const mouseTargetRadius = nodeRadius + (2 * connectorStrokeWidth);

        const key = node.key;

        const completePercent = node.completePercent || 0;
        const groupChildren = [this.getNodeChildren(node)];

        // Add an invisible click/touch target, coz the nodes are small and (more importantly)
        // many are hollow.
        groupChildren.push(
            <circle r={mouseTargetRadius}
                    cursor="pointer"
                    className="pipeline-node-hittarget"
                    fillOpacity="0"
                    stroke="none"
                    onClick={() => this.nodeClicked(node)}/>
        );

        // All the nodes are in shared code, so they're rendered at 0,0 so we transform within a <g>
        const groupProps = {
            key,
            transform: `translate(${node.x},${node.y})`,
            className: nodeIsSelected ? "pipeline-node-selected" : "pipeline-node"
        };

        return React.createElement("g", groupProps, ...groupChildren);
    }

    renderSelectionHighlight() {

        const { nodeRadius, connectorStrokeWidth } = this.state.layout;
        const highlightRadius = nodeRadius + (0.49 * connectorStrokeWidth);
        let selectedNode = null;

        for (const node of this.state.nodes) {
            if (this.nodeIsSelected(node)) {
                selectedNode = node;
                break;
            }
        }

        if (!selectedNode) {
            return null;
        }

        const transform = `translate(${selectedNode.x} ${selectedNode.y})`;

        return (
            <g className="pipeline-selection-highlight" transform={transform}>
                <circle r={highlightRadius} strokeWidth={connectorStrokeWidth * 1.1}/>
            </g>
        );
    }

    nodeIsSelected(node:NodeInfo) {
        const {selectedNode} = this.state;
        return selectedNode && selectedNode === node;
    }

    stageChildIsSelected(stage: StageInfo) {
        const {selectedNode} = this.state;
        return selectedNode && selectedNode.parentStage === stage;
    }

    nodeClicked(node:NodeInfo) {

        const listener = this.props.onNodeClick;

        if (node.isPlaceholder === false) {
            const stage = node.stage;
            const name = stage.name;
            const id = stage.id;

            if (listener) {
                listener(name, id);
            }

            // Update selection
            this.setState({selectedNode: node});

        } else if (node.type === "start") {

            if (listener) {
                listener("start", -1);
            }

            // Update selection
            this.setState({selectedNode: node});
        }



        // TODO: Allow selection of start node
        // TODO: Dispatch "addStage" and "addParallelStage" or something
    }

    render() {
        const {
            nodes = [],
            connections = [],
            bigLabels = [],
            smallLabels = [],
            measuredWidth,
            measuredHeight } = this.state;

        // These are about layout more than appearance, so they should probably remain inline
        const outerDivStyle = {
            position: "relative", // So we can put the labels where we need them
            overflow: "visible" // So long labels can escape this component in layout
        };

        return (
            <div style={outerDivStyle}>
                <svg width={measuredWidth} height={measuredHeight}>
                    {this.renderSelectionHighlight()}
                    {connections.map(conn => this.renderConnection(conn))}
                    {nodes.map(node => this.renderNode(node))}
                </svg>
                {bigLabels.map(label => this.renderBigLabel(label))}
                {smallLabels.map(label => this.renderSmallLabel(label))}
            </div>
        );
    }
}

EditorPipelineGraph.propTypes = {
    stages: PropTypes.array,
    layout: PropTypes.object,
    onNodeClick: PropTypes.func, // TODO: Replace with a set of onSelectionChange / onAddStage / onAddParallelStage,
    selectedStage: PropTypes.object
};