using System;
using System.Windows;
using System.Windows.Controls;
using OotMapper.Types;

namespace OotMapper.Display
{
	public class Viewport
	{
		private const double MinZoom = 0.2;
		private const double DefaultZoom = 1.5;
		private const double MaxZoom = 30;

		private Canvas _canvas;
		private double _zoom = DefaultZoom;
		private Coord CanvasCentre => new Coord(_canvas.ActualWidth / 2, _canvas.ActualHeight / 2);
		public Coord ViewPoint { get; private set; } = new Coord(0, 0);
		private bool _isPanning = false;
		private Coord _panOffset = new Coord(0, 0);

		public Viewport(Canvas canvas) {
			_canvas = canvas;
		}

		public void ScaleZoom(double change, Coord focus = null) {
			double oldZoom = _zoom;
			SetZoom(_zoom * (1+change));
			if (focus != null && change > 0) {
				focus = PosViewToModel(focus);
				Coord viewDelta = (focus - ViewPoint) * ((_zoom / oldZoom)-1);
				ViewPoint += viewDelta;
			}
			NotifyChange();
		}

		public void SetZoom(double newZoom) {
			double oldZoom = _zoom;
			double val = Math.Min(MaxZoom, newZoom);
			_zoom = Math.Max(MinZoom, val);

			if (_zoom != oldZoom) {
				NotifyChange();
			}
		}

		public void SetViewPoint(Coord viewCoords) {
			if (!viewCoords.Equals(ViewPoint)) {
				ViewPoint = PosViewToModel(viewCoords);
				NotifyChange();
			}
		}

		public void StartViewPan(Coord initialPos) {
			_panOffset = PosViewToModel(initialPos);
			_isPanning = true;
		}

		public void PanHandleMoved(Coord newPos) {
			if (_isPanning) {
				ViewPoint += _panOffset - PosViewToModel(newPos);
				NotifyChange();
			}
		}

		public void StopPan() {
			_isPanning = false;
		}

		public Size SizeModelToView(Size size) {
			return new Size(size.Width * _zoom, size.Height * _zoom);
		}

		public Coord SizeModelToView(Coord coord) {
			return new Coord(coord.X * _zoom, coord.Y * _zoom);
		}

		public Size SizeViewToModel(Size size) {
			return new Size(size.Width / _zoom, size.Height / _zoom);
		}

		public Coord PosModelToView(Coord position) {
			Coord result = ((position - ViewPoint) * _zoom) + CanvasCentre;
			return result;
		}

		public Coord PosViewToModel(Coord position) {
			Coord result = (position - CanvasCentre) * (1/_zoom) + ViewPoint;
			return result;
		}

		private void NotifyChange() {
			OnChange?.Invoke(this, EventArgs.Empty);
		}

		public event EventHandler OnChange;
	}
}
