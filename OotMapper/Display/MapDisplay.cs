using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Shapes;
using OotMapper.Model;
using OotMapper.Types;

namespace OotMapper.Display
{
	public class MapDisplay
	{
		private Layout _layout;
		private Canvas _canvas;
		private Polygon _origin;
		public Dictionary<string, SegmentDisplay> SegDisplays = new Dictionary<string, SegmentDisplay>();
		public Dictionary<string, LinkDisplay> LinkDisplays = new Dictionary<string, LinkDisplay>();

		public Viewport View;
		public LinkCreator LinkCreator;

		private BaseMapInfo _baseMapInfo;

		public MapDisplay(Canvas canvas, BaseMapInfo baseMapInfo, Layout layout) {
			_canvas = canvas;
			_baseMapInfo = baseMapInfo;
			_layout = layout;
			View = new Viewport(_canvas);
			View.OnChange += View_OnChange; ;
			LinkCreator = new LinkCreator(_layout);

			_canvas.MouseMove += OnMouseMove;
		}

		private void View_OnChange(object sender, EventArgs e) {
			Refresh();
		}

		public void ExteriorEntranceClicked(string enId) {
			if (DevPowers.BasemapEditing) {
				_editSelectedEntrance = enId;
			} else {
				bool finalised = LinkCreator.Add(enId);
				_canvas.Background = finalised ? Brushes.PapayaWhip : Brushes.LightSkyBlue;

			}
			Refresh();
		}

		public Coord GetEntrancePos(string enId) {
			string segId = _baseMapInfo.EntranceParent(enId);

			Entrance entrance = _baseMapInfo.GetEntrance(enId);
			MapSegment segment = _baseMapInfo.GetSegment(segId);
			return (segment.Size.AsCoord() * entrance.FractionCoords) + _layout.GetSegmentPos(segId);
		}

		public void Refresh() {
			DrawOrigin();
			RegisterNewSegments();
			RefreshSegments();

			AddRemoveLinks();
			RefreshLinks();
		}

		public void Add(UIElement element, int zIndex) {
			_canvas.Children.Add(element);
			Panel.SetZIndex(element, zIndex);
		}

		public void Remove(UIElement element) {
			_canvas.Children.Remove(element);
		}

		public void Move(UIElement element, Coord pos) {
			Canvas.SetLeft(element, pos.X);
			Canvas.SetTop(element, pos.Y);
		}

		public Coord GetModelMousePos(MouseEventArgs e) {
			Coord viewPos = Coord.FromPoint(e.GetPosition(_canvas));
			return View.PosViewToModel(viewPos);
		}

		private void RegisterNewSegments() {
			foreach (string segmentId in _layout.CurrentSegments) {
				if (!SegDisplays.ContainsKey(segmentId)) {
					MapSegment newSeg = _baseMapInfo.GetSegment(segmentId);
					Coord pos = _layout.GetSegmentPos(segmentId);
					SegDisplays.Add(segmentId, new SegmentDisplay(this, _layout, _baseMapInfo, segmentId));
				}
			}
		}

		private void DrawOrigin() {
			Size size = View.SizeModelToView(new Size(60, 50));
			Coord pos = View.PosModelToView(new Coord(0, 0));
			PointCollection points = new PointCollection {
				new Point(-0.5, -0.5), new Point(0, -0.5), new Point(-0.25, 0), new Point(0.25, 0),
				new Point(0, -0.5), new Point(0.5, -0.5), new Point(0, 0.5)
			};
			if (_origin == null) {
				_origin = new Polygon {
					Fill = Brushes.Gray,
					//StrokeThickness = 10
				};
				Panel.SetZIndex(_origin, -1000);
				_canvas.Children.Add(_origin);
			}
			_origin.Points = new PointCollection(points.Select(p => new Point(p.X * size.Width, -p.Y * size.Height)));
			Move(_origin, pos);
		}

		private void RefreshSegments() {
			foreach (SegmentDisplay segment in SegDisplays.Values) {
				segment.Refresh();
			}
		}

		private void AddRemoveLinks() {
			Dictionary<string, LinkDisplay> keptDisplays = new Dictionary<string, LinkDisplay>();
			foreach (string linkId in LinkDisplays.Keys) {
				if (_layout.Links.Where(l => l.Id == linkId).Count() == 0) {
					LinkDisplays[linkId].Dispose();
				} else {
					keptDisplays.Add(linkId, LinkDisplays[linkId]);
				}
			}

			LinkDisplays = keptDisplays;
			foreach (Link link in _layout.Links) {
				if (!LinkDisplays.ContainsKey(link.Id)) {
					LinkDisplays.Add(link.Id, new LinkDisplay(this, link));
				}
			}
		}

		private void RefreshLinks() {
			foreach (LinkDisplay link in LinkDisplays.Values) {
				link.Refresh();
			}
		}

		private void OnMouseMove(object sender, MouseEventArgs e) {
			foreach (SegmentDisplay segDisp in SegDisplays.Values) {
				segDisp.OnMouseMove(e);
			}
		}

		// Dev Powers
		private string _editSelectedEntrance = null;
		private bool _buffered = false;
		public void EntranceEditClick(Coord viewPos) {
			if (_editSelectedEntrance is null) {
				return;
			}
			if (!_buffered) {
				_buffered = true;
				return;
			}
			_buffered = false;
			Coord pos = View.PosViewToModel(viewPos);
			string segId = _baseMapInfo.EntranceParent(_editSelectedEntrance);
			Coord segPos = _layout.GetSegmentPos(segId);
			Size segSize = _baseMapInfo.GetSegment(segId).Size;

			double newX = Math.Min(Math.Max((pos.X - segPos.X) / segSize.Width, 0), 1);
			double newY = Math.Min(Math.Max((pos.Y - segPos.Y) / segSize.Height, 0), 1);

			_baseMapInfo.GetEntrance(_editSelectedEntrance).FractionCoords = new Coord(newX, newY);
			_editSelectedEntrance = null;
			Refresh();
		}
	}
}
